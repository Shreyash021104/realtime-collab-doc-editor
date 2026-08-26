// Integration test: proves collaboration survives horizontal scaling.
//
// Each document's Y.Doc lives in one process's memory, so before the Redis
// relay two clients load-balanced onto different instances would silently
// edit in isolation. This spawns two real server instances on different ports
// sharing one Postgres and one Redis, connects a client to each, has both
// type, and asserts they converge — which can only happen if updates crossed
// the instance boundary.
//
// It also covers the cold-start case: instance B loads the room from Postgres
// *after* A already has unsaved in-memory edits, so B must pull the newer
// state from its peer rather than serving the stale row.
//
// Usage: node scripts/multi-instance-test.mjs

import { spawn } from "node:child_process";
import WebSocket from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync.js";

const MESSAGE_SYNC = 0;
const PORT_A = 4101;
const PORT_B = 4102;

// `npx tsx` is a wrapper: it spawns the real node server as a grandchild.
// Killing the child alone leaves that grandchild running, and the stdio pipes
// we inherited from it keep this process's event loop alive forever — the test
// prints PASS and then hangs. `detached` puts the whole thing in its own
// process group so it can be torn down as a unit.
function startInstance(port) {
  const child = spawn("npx", ["tsx", "src/index.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stderr.on("data", (d) => process.stderr.write(`[:${port}] ${d}`));
  return child;
}

function stopInstance(child) {
  try {
    process.kill(-child.pid, "SIGTERM"); // negative pid = the whole group
  } catch {
    // already exited
  }
}

async function waitForHealth(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(250);
  }
  throw new Error(`instance on port ${port} never became healthy`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function registerUser(port, email) {
  const res = await fetch(`http://localhost:${port}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: email }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return (await res.json()).token;
}

async function createDocument(port, token, title) {
  const res = await fetch(`http://localhost:${port}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`create doc failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

// A headless Yjs client speaking the same wire protocol as the browser
// provider. Stays open so the caller controls timing across two instances.
function connectClient(port, token, docId) {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");
    const ws = new WebSocket(
      `ws://localhost:${port}/ws/documents/${docId}?token=${token}`
    );
    ws.binaryType = "arraybuffer";
    ws.on("error", reject);

    ws.on("message", (data) => {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) return;
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

    ws.on("open", () => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      writeSyncStep1(encoder, doc);
      ws.send(encoding.toUint8Array(encoder));
      resolve({
        type: (text) => doc.transact(() => ytext.insert(0, text)),
        text: () => ytext.toString(),
        close: () => ws.close(),
      });
    });
  });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const instances = [startInstance(PORT_A), startInstance(PORT_B)];
  try {
    await Promise.all([waitForHealth(PORT_A), waitForHealth(PORT_B)]);

    const token = await registerUser(PORT_A, `multi-${Date.now()}@example.com`);
    const docId = await createDocument(PORT_A, token, "Multi-instance test");

    // Client A types first and alone, so instance B has to cold-start its room
    // while A's edit is still only in A's memory.
    const clientA = await connectClient(PORT_A, token, docId);
    await sleep(300);
    clientA.type("AAA");
    await sleep(300);

    const clientB = await connectClient(PORT_B, token, docId);
    await sleep(600);

    if (!clientB.text().includes("AAA")) {
      fail(
        `client B cold-started without its peer's unsaved edit — saw ${JSON.stringify(clientB.text())}`
      );
    }

    clientB.type("BBB");
    await sleep(800);

    const textA = clientA.text();
    const textB = clientB.text();
    console.log("Instance A client text:", JSON.stringify(textA));
    console.log("Instance B client text:", JSON.stringify(textB));

    if (textA !== textB) {
      fail("clients on different instances diverged — the relay did not sync them.");
    } else if (!textA.includes("AAA") || !textA.includes("BBB")) {
      fail("converged text is missing one client's insert.");
    } else {
      console.log(
        "PASS: clients on separate instances converged to:",
        JSON.stringify(textA)
      );
    }

    clientA.close();
    clientB.close();
    await sleep(200);
  } finally {
    for (const instance of instances) stopInstance(instance);
  }
}

function finish() {
  // Belt and braces: even with the process group killed, one stray handle
  // would hang CI for the length of the job timeout rather than failing. Give
  // piped stdout a moment to flush, then exit for certain.
  setTimeout(() => process.exit(process.exitCode ?? 0), 100);
}

main().then(finish, (err) => {
  console.error(err);
  process.exitCode = 1;
  finish();
});
