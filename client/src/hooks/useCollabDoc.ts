import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { WS_URL, getToken } from "../api/client";

export type SyncStatus = "connecting" | "connected" | "disconnected";

interface CacheEntry {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  refCount: number;
}

// Module-level cache, keyed by documentId, outside of React's render cycle.
//
// React 18/19 StrictMode intentionally double-invokes effects in dev
// (mount -> cleanup -> mount) to surface side-effect bugs. A naive
// `useMemo(() => new WebsocketProvider(...))` + "destroy on cleanup" pairing
// falls right into that trap: the simulated cleanup calls `.destroy()` on
// the provider while its WebSocket handshake is often still in flight, and
// because useMemo's cached value survives the double-invoke, the *second*
// effect run reuses that same now-destroyed provider — which never
// reconnects, so the client is stuck showing "connecting" forever. This bit
// us during manual browser testing (see README).
//
// Reference-counting the underlying provider fixes it: each acquire()
// either hands back a still-live entry (refCount > 0) or, if the previous
// one was just torn down, builds a genuinely fresh provider — never a
// half-destroyed one.
const cache = new Map<string, CacheEntry>();

function acquire(documentId: string): CacheEntry {
  const existing = cache.get(documentId);
  if (existing) {
    existing.refCount++;
    return existing;
  }
  const ydoc = new Y.Doc();
  const token = getToken() ?? "";
  const provider = new WebsocketProvider(`${WS_URL}/ws/documents`, documentId, ydoc, {
    params: { token },
  });
  const entry: CacheEntry = { ydoc, provider, refCount: 1 };
  cache.set(documentId, entry);
  return entry;
}

function release(documentId: string) {
  const entry = cache.get(documentId);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    entry.provider.destroy();
    entry.ydoc.destroy();
    cache.delete(documentId);
  }
}

export function useCollabDoc(documentId: string) {
  const [entry, setEntry] = useState<CacheEntry | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");

  useEffect(() => {
    const acquired = acquire(documentId);
    setEntry(acquired);
    setStatus(acquired.provider.wsconnected ? "connected" : "connecting");

    const onStatus = ({ status }: { status: SyncStatus }) => setStatus(status);
    acquired.provider.on("status", onStatus);

    return () => {
      acquired.provider.off("status", onStatus);
      release(documentId);
    };
  }, [documentId]);

  return { ydoc: entry?.ydoc, provider: entry?.provider, status };
}
