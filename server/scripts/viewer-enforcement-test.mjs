// Integration test: proves read-only share links are enforced server-side,
// not just hidden behind a disabled UI. A "viewer" who sends a raw protocol
// update (bypassing the React app entirely) must have that update silently
// dropped rather than persisted or broadcast to other clients.
//
// Usage: node scripts/viewer-enforcement-test.mjs [http://localhost:4000]

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
  return (await res.json()).token;
}

async function createDocument(token, title) {
  const res = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  });
  return (await res.json()).id;
}

async function createShareLink(token, docId, role) {
  const res = await fetch(`${baseUrl}/api/documents/${docId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
  return (await res.json()).token;
}

async function joinShareLink(token, shareToken) {
  await fetch(`${baseUrl}/api/documents/join/${shareToken}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function runClient(token, docId, insertText, waitMs) {
  return new Promise((resolve, reject) => {
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
      if (insertText) {
        setTimeout(() => doc.transact(() => ytext.insert(ytext.length, insertText)), 300);
      }
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
    }, waitMs);
  });
}

async function main() {
  const suffix = Date.now();
  const ownerToken = await registerUser(`owner-${suffix}@example.com`);
  const viewerToken = await registerUser(`viewer-${suffix}@example.com`);
  const docId = await createDocument(ownerToken, "Viewer enforcement test");
  const shareToken = await createShareLink(ownerToken, docId, "viewer");
  await joinShareLink(viewerToken, shareToken);

  await runClient(ownerToken, docId, "FROM-OWNER", 1200);
  // Bypasses the React UI (which would disable the editor for a viewer) and
  // sends a raw Yjs update directly over the socket, simulating a malicious
  // or buggy client.
  await runClient(viewerToken, docId, "FROM-VIEWER-SHOULD-BE-BLOCKED", 1200);
  const persisted = await runClient(ownerToken, docId, "", 1000);

  console.log("Server-persisted text:", JSON.stringify(persisted));

  if (persisted.includes("FROM-VIEWER")) {
    console.error("FAIL: a viewer's edit was persisted — read-only enforcement is broken.");
    process.exit(1);
  }
  if (!persisted.includes("FROM-OWNER")) {
    console.error("FAIL: the owner's legitimate edit did not persist.");
    process.exit(1);
  }
  console.log("PASS: viewer's write was rejected server-side; owner's write persisted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
