
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync.js";
import {
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness.js";

interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}
import type { WebSocket } from "ws";
import { query } from "../db.js";
import { env } from "../env.js";
import { MESSAGE_AWARENESS, MESSAGE_SYNC } from "./protocol.js";

export interface RoomConnection {
  ws: WebSocket;
  userId: string;
  canWrite: boolean;
  awarenessClientId: number;
}

export class Room {
  readonly documentId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly connections = new Set<RoomConnection>();

  private saveTimer: NodeJS.Timeout | null = null;
  private lastSnapshotAt = 0;
  private dirty = false;

  private constructor(documentId: string, doc: Y.Doc) {
    this.documentId = documentId;
    this.doc = doc;
    this.awareness = new Awareness(doc);

    // Persist locally, then re-broadcast to every other connection in the
    // room except whichever connection's message triggered this update
    // (that client already has the change).
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      this.dirty = true;
      this.scheduleSave();

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder), originWs(origin));
    });

    this.awareness.on(
      "update",
      (changes: AwarenessChanges, origin: unknown) => {
        const changedClients = [
          ...changes.added,
          ...changes.updated,
          ...changes.removed,
        ];
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          encodeAwarenessUpdate(this.awareness, changedClients)
        );
        this.broadcast(encoding.toUint8Array(encoder), originWs(origin));
      }
    );
  }

  static async load(documentId: string): Promise<Room> {
    const doc = new Y.Doc();
    const result = await query<{ state: Buffer | null }>(
      "SELECT state FROM documents WHERE id = $1",
      [documentId]
    );
    const state = result.rows[0]?.state;
    if (state) {
      Y.applyUpdate(doc, new Uint8Array(state));
    }
    return new Room(documentId, doc);
  }

  // Debounced persistence: we don't write to Postgres on every keystroke.
  // Instead, batch updates and flush ~snapshotIntervalMs after the last
  // change, which keeps write volume proportional to "pauses in typing"
  // rather than "characters typed."
  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, env.snapshotIntervalMs);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const state = Buffer.from(Y.encodeStateAsUpdate(this.doc));
    await query(
      "UPDATE documents SET state = $1, updated_at = now() WHERE id = $2",
      [state, this.documentId]
    );

    // Keep a lightweight version history: one labelled snapshot every ~2
    // minutes of active editing, not on every flush.
    const now = Date.now();
    if (now - this.lastSnapshotAt > 2 * 60 * 1000) {
      this.lastSnapshotAt = now;
      await query(
        "INSERT INTO document_snapshots (document_id, state, label) VALUES ($1, $2, $3)",
        [this.documentId, state, new Date(now).toLocaleString()]
      );
    }
  }

  broadcast(message: Uint8Array, exclude?: WebSocket) {
    for (const conn of this.connections) {
      if (conn.ws !== exclude && conn.ws.readyState === conn.ws.OPEN) {
        conn.ws.send(message);
      }
    }
  }

  removeConnection(conn: RoomConnection) {
    this.connections.delete(conn);
    // Immediately clear this client's awareness state (cursor, presence) so
    // peers see it disappear right away instead of waiting for a timeout.
    removeAwarenessStates(this.awareness, [conn.awarenessClientId], "conn-closed");
  }
}

function originWs(origin: unknown): WebSocket | undefined {
  if (origin && typeof origin === "object" && "ws" in origin) {
    return (origin as RoomConnection).ws;
  }
  return undefined;
}

export class RoomRegistry {
  private rooms = new Map<string, Promise<Room>>();

  async get(documentId: string): Promise<Room> {
    let roomPromise = this.rooms.get(documentId);
    if (!roomPromise) {
      roomPromise = Room.load(documentId);
      this.rooms.set(documentId, roomPromise);
    }
    return roomPromise;
  }

  async closeIfEmpty(documentId: string): Promise<void> {
    const roomPromise = this.rooms.get(documentId);
    if (!roomPromise) return;
    const room = await roomPromise;
    if (room.connections.size === 0) {
      await room.flush();
      this.rooms.delete(documentId);
    }
  }
}

export const rooms = new RoomRegistry();
