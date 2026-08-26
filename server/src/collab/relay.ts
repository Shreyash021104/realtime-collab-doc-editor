// Cross-instance relay for document rooms.
//
// A document's Y.Doc lives in one process's memory. With more than one server
// instance behind a load balancer, two clients editing the same document can
// land on different instances and never see each other. This relays every
// sync/awareness update over a Redis pub/sub channel (one per document) so
// each instance holding that document applies it locally and fans it out to
// its own connections.
import { randomUUID } from "node:crypto";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { redis, redisSub } from "../redis.js";

const INSTANCE_ID = randomUUID();

// Marks a Y.Doc/Awareness mutation as having arrived from a peer instance, so
// the room broadcasts it to local clients without publishing it back to Redis
// and starting a relay loop.
export const RELAY_ORIGIN = { relay: true };

export const RELAY_UPDATE = 0;
export const RELAY_AWARENESS = 1;
export const RELAY_STATE_REQUEST = 2;
export const RELAY_STATE_RESPONSE = 3;

export interface RelayMessage {
  kind: number;
  payload: Uint8Array;
}

type RelayHandler = (message: RelayMessage) => void;

const handlers = new Map<string, RelayHandler>();
let listening = false;

function channelFor(documentId: string): string {
  return `collab:doc:${documentId}`;
}

// ioredis emits "message" with a lossy utf-8 string; Yjs payloads are binary,
// so the Buffer variant is the only safe one here.
function startListening() {
  if (listening) return;
  listening = true;
  redisSub.on("messageBuffer", (channel: Buffer, data: Buffer) => {
    const handler = handlers.get(channel.toString());
    if (!handler) return;

    const decoder = decoding.createDecoder(new Uint8Array(data));
    if (decoding.readVarString(decoder) === INSTANCE_ID) return;
    handler({
      kind: decoding.readVarUint(decoder),
      payload: decoding.readVarUint8Array(decoder),
    });
  });
}

export async function subscribeRelay(
  documentId: string,
  handler: RelayHandler
): Promise<void> {
  startListening();
  handlers.set(channelFor(documentId), handler);
  await redisSub.subscribe(channelFor(documentId));
}

export async function unsubscribeRelay(documentId: string): Promise<void> {
  handlers.delete(channelFor(documentId));
  await redisSub.unsubscribe(channelFor(documentId));
}

export async function publishRelay(
  documentId: string,
  kind: number,
  payload: Uint8Array
): Promise<void> {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, INSTANCE_ID);
  encoding.writeVarUint(encoder, kind);
  encoding.writeVarUint8Array(encoder, payload);
  await redis.publish(
    channelFor(documentId),
    Buffer.from(encoding.toUint8Array(encoder))
  );
}
