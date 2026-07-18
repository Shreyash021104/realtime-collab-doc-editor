import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
  readSyncStep1,
  readSyncStep2,
  writeSyncStep1,
} from "y-protocols/sync.js";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness.js";
import { verifyToken } from "../auth/jwt.js";
import { getRole, atLeast } from "../permissions.js";
import { rooms, type RoomConnection, type Room } from "./room.js";
import { markPresent, clearPresence } from "../redis.js";
import { MESSAGE_AWARENESS, MESSAGE_SYNC } from "./protocol.js";

function sendSyncStep1(conn: RoomConnection, room: Room) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  writeSyncStep1(encoder, room.doc);
  conn.ws.send(encoding.toUint8Array(encoder));
}

function sendCurrentAwareness(conn: RoomConnection, room: Room) {
  const states = room.awareness.getStates();
  if (states.size === 0) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    encodeAwarenessUpdate(room.awareness, [...states.keys()])
  );
  conn.ws.send(encoding.toUint8Array(encoder));
}

function handleSyncMessage(decoder: decoding.Decoder, conn: RoomConnection, room: Room) {
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageYjsSyncStep1: {
      // Reading a peer's state vector never mutates our doc, so this is
      // always safe to answer even for read-only viewers.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      readSyncStep1(decoder, encoder, room.doc);
      conn.ws.send(encoding.toUint8Array(encoder));
      break;
    }
    case messageYjsSyncStep2:
    case messageYjsUpdate: {
      // These mutate the shared doc, so viewers are blocked here — this is
      // the enforcement point for read-only sharing links.
      if (!conn.canWrite) return;
      readSyncStep2(decoder, room.doc, conn);
      break;
    }
    default:
      break;
  }
}

export function attachCollabWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://internal");
    if (!url.pathname.startsWith("/ws/documents/")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Real Yjs client providers send their initial SyncStep1 the instant the
    // socket opens, which can race ahead of the async setup below (auth
    // check, room load from Postgres, presence write). If we attached the
    // "message" listener only after those awaits resolved, that first
    // message would already have fired-and-been-lost on the EventEmitter
    // with nobody listening. So we attach a listener synchronously and
    // queue anything that arrives before setup finishes.
    const pending: Buffer[] = [];
    let dispatch: ((data: Buffer) => void) | null = null;
    ws.on("message", (data: Buffer) => {
      if (dispatch) dispatch(data);
      else pending.push(data);
    });

    void setup();

    async function setup() {
      const url = new URL(req.url ?? "", "http://internal");
      const documentId = url.pathname.replace("/ws/documents/", "");
      const token = url.searchParams.get("token") ?? "";

      let payload;
      try {
        payload = verifyToken(token);
      } catch {
        ws.close(4001, "Unauthorized");
        return;
      }

      const role = await getRole(documentId, payload.sub);
      if (!role) {
        ws.close(4003, "Forbidden");
        return;
      }

      const room = await rooms.get(documentId);
      const canWrite = atLeast(role, "editor");
      const awarenessClientId = Math.floor(Math.random() * 0xffffffff);
      const conn: RoomConnection = {
        ws,
        userId: payload.sub,
        canWrite,
        awarenessClientId,
      };
      room.connections.add(conn);

      await markPresent(documentId, payload.sub, {
        name: payload.name,
        color: payload.color,
      });
      const presenceInterval = setInterval(() => {
        void markPresent(documentId, payload.sub, {
          name: payload.name,
          color: payload.color,
        });
      }, 15_000);

      dispatch = (data: Buffer) => {
        const decoder = decoding.createDecoder(new Uint8Array(data));
        const messageType = decoding.readVarUint(decoder);

        if (messageType === MESSAGE_SYNC) {
          handleSyncMessage(decoder, conn, room);
        } else if (messageType === MESSAGE_AWARENESS) {
          if (!conn.canWrite) return; // read-only viewers don't get a cursor
          applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
        }
      };

      ws.on("close", () => {
        clearInterval(presenceInterval);
        room.removeConnection(conn);
        void clearPresence(documentId, payload.sub);
        void rooms.closeIfEmpty(documentId);
      });

      // Handshake: tell the new client our state vector (they'll reply with
      // whatever we're missing), and replay existing awareness state (other
      // users' live cursors) so presence is correct on first paint.
      sendSyncStep1(conn, room);
      sendCurrentAwareness(conn, room);

      // Now that we're set up, drain anything that arrived during setup, in
      // the order it arrived.
      for (const data of pending.splice(0)) {
        dispatch(data);
      }
    }
  });

  return wss;
}
