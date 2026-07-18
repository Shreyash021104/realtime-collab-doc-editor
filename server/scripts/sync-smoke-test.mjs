// Integration test: proves the server-side CRDT sync actually converges
// under concurrent edits, not just when clients take turns. Spins up two
// headless Yjs clients against a running server instance, has them type
// into the same document at (roughly) the same time, and asserts both
// converge to an identical final string.
//
// Usage: node scripts/sync-smoke-test.mjs [http://localhost:4000]

import WebSocket from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync.js";

const baseUrl = process.argv[2] ?? "http://localhost:4000";
const wsBaseUrl = baseUrl.replace(/^http/, "ws");
const MESSAGE_SYNC = 0;

async function registerUser(email) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: email }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const { token } = await res.json();
  return token;
}

async function createDocument(token, title) {
  const res = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`create doc failed: ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  return id;
}

function runClient(token, docId, insertText, connectDelayMs) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const doc = new Y.Doc();
      const ytext = doc.getText("content");
      const ws = new WebSocket(`${wsBaseUrl}/ws/documents/${docId}?token=${token}`);
      ws.binaryType = "arraybuffer";

      ws.on("error", reject);

      ws.on("open", () => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        writeSyncStep1(encoder, doc);
        ws.send(encoding.toUint8Array(encoder));

        setTimeout(() => {
          doc.transact(() => ytext.insert(0, insertText));
        }, 300);
      });

      ws.on("message", (data) => {
        const decoder = decoding.createDecoder(new Uint8Array(data));
        const messageType = decoding.readVarUint(decoder);
        if (messageType !== MESSAGE_SYNC) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        readSyncMessage(decoder, encoder, doc, "remote");
        if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
      });

      doc.on("update", (update, origin) => {
        if (origin === "remote") return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        writeUpdate(encoder, update);
        ws.send(encoding.toUint8Array(encoder));
      });

      setTimeout(() => {
        const text = ytext.toString();
        ws.close();
        resolve(text);
      }, 1500);
    }, connectDelayMs);
  });
}

async function main() {
  const token = await registerUser(`sync-test-${Date.now()}@example.com`);
  const docId = await createDocument(token, "Sync smoke test");

  const [textFromA, textFromB] = await Promise.all([
    runClient(token, docId, "X", 0),
    runClient(token, docId, "Y", 0),
  ]);

  console.log("Client A final text:", JSON.stringify(textFromA));
  console.log("Client B final text:", JSON.stringify(textFromB));

  if (textFromA !== textFromB) {
    console.error("FAIL: clients diverged — CRDT merge did not converge.");
    process.exit(1);
  }
  if (!textFromA.includes("X") || !textFromA.includes("Y")) {
    console.error("FAIL: converged text is missing one client's insert.");
    process.exit(1);
  }
  console.log("PASS: concurrent edits from two clients converged to:", JSON.stringify(textFromA));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
