import { Redis } from "ioredis";
import { env } from "./env.js";

// Two connections: one for normal commands, one dedicated to pub/sub
// subscriptions (ioredis requires a separate connection once .subscribe()
// is called on it).
export const redis = new Redis(env.redisUrl);
export const redisSub = new Redis(env.redisUrl);

const PRESENCE_TTL_SECONDS = 30;

export function presenceKey(documentId: string, userId: string): string {
  return `presence:${documentId}:${userId}`;
}

export async function markPresent(
  documentId: string,
  userId: string,
  info: { name: string; color: string }
): Promise<void> {
  await redis.set(
    presenceKey(documentId, userId),
    JSON.stringify(info),
    "EX",
    PRESENCE_TTL_SECONDS
  );
}

export async function clearPresence(
  documentId: string,
  userId: string
): Promise<void> {
  await redis.del(presenceKey(documentId, userId));
}

// Returns true for exactly one caller per document per interval, so that N
// server instances holding the same document write one snapshot between them.
export async function claimSnapshotSlot(
  documentId: string,
  intervalMs: number
): Promise<boolean> {
  const result = await redis.set(
    `snapshot-slot:${documentId}`,
    "1",
    "PX",
    intervalMs,
    "NX"
  );
  return result === "OK";
}

export async function listPresence(
  documentId: string
): Promise<Array<{ userId: string; name: string; color: string }>> {
  const keys = await redis.keys(`presence:${documentId}:*`);
  if (keys.length === 0) return [];
  const values = await redis.mget(keys);
  return keys.map((key: string, i: number) => {
    const userId = key.split(":")[2];
    const raw = values[i];
    const info = raw ? JSON.parse(raw) : { name: "unknown", color: "#999" };
    return { userId, ...info };
  });
}
