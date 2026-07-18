// One-off visual verification script (not part of the app or its test
// suite). Drives two real Chromium browser contexts through the actual
// signup -> create doc -> share -> collaborative typing flow, and saves
// screenshots so I can inspect the real rendered UI instead of just
// trusting that it compiles.
//
// Usage: node scripts/visual-check.mjs [baseUrl]
// Defaults to the local dev server; pass a deployed URL to smoke-test prod,
// e.g. node scripts/visual-check.mjs https://client-six-iota-77.vercel.app
import { chromium } from "playwright";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const shotDir = path.join(import.meta.dirname, ".playwright-screenshots");
const suffix = Date.now();

const browser = await chromium.launch();

const ctxA = await browser.newContext();
const pageA = await ctxA.newPage();
const ctxB = await browser.newContext();
const pageB = await ctxB.newPage();

pageA.on("console", (msg) => console.log("[A console]", msg.type(), msg.text()));
pageA.on("pageerror", (err) => console.log("[A pageerror]", err.message));
pageA.on("requestfailed", (req) => console.log("[A requestfailed]", req.url(), req.failure()?.errorText));
pageB.on("console", (msg) => console.log("[B console]", msg.type(), msg.text()));
pageB.on("pageerror", (err) => console.log("[B pageerror]", err.message));
pageB.on("requestfailed", (req) => console.log("[B requestfailed]", req.url(), req.failure()?.errorText));

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
}

// --- Client A: register, land on empty dashboard ---
await pageA.goto(`${baseUrl}/login`);
await pageA.getByText("Need an account? Sign up").click();
await pageA.getByLabel("Name").fill("Alice Visual");
await pageA.getByLabel("Email").fill(`alice-visual-${suffix}@example.com`);
await pageA.getByLabel("Password").fill("password123");
await shot(pageA, "01-register-form");
await pageA.getByRole("button", { name: "Sign up" }).click();
await pageA.waitForURL("**/documents");
await shot(pageA, "02-empty-dashboard");

// --- Client A: create a document, type into the editor ---
await pageA.getByRole("button", { name: "+ New document" }).click();
await pageA.waitForURL("**/documents/*");
await pageA.locator(".ProseMirror").click();
await pageA.keyboard.type("Hello from Alice. ");
await shot(pageA, "03-alice-typed");

// --- Get a share link so Bob can join as an editor ---
await pageA.getByRole("button", { name: "Share" }).click();
await pageA.getByLabel("Access level").selectOption("editor");
await pageA.getByRole("button", { name: "Generate link" }).click();
const shareLink = await pageA.locator(".share-link-row input").inputValue();
console.log("Share link:", shareLink);
await shot(pageA, "04-share-dialog");
await pageA.getByRole("button", { name: "Close" }).click();

// --- Client B: register, join via the share link ---
await pageB.goto(`${baseUrl}/login`);
await pageB.getByText("Need an account? Sign up").click();
await pageB.getByLabel("Name").fill("Bob Visual");
await pageB.getByLabel("Email").fill(`bob-visual-${suffix}@example.com`);
await pageB.getByLabel("Password").fill("password123");
await pageB.getByRole("button", { name: "Sign up" }).click();
await pageB.waitForURL("**/documents");
await pageB.goto(shareLink);
await pageB.waitForURL("**/documents/*");
await pageB.waitForTimeout(1000); // let Yjs sync settle
await shot(pageB, "05-bob-joined-sees-alice-text");

// --- Both type concurrently, verify live sync + presence + cursors ---
await pageA.locator(".ProseMirror").click();
await pageA.keyboard.press("End");
await pageB.locator(".ProseMirror").click();
await pageB.keyboard.press("End");
await Promise.all([
  pageA.keyboard.type("More from Alice. "),
  pageB.keyboard.type("Hello from Bob."),
]);
await pageA.waitForTimeout(1500); // let sync converge
await shot(pageA, "06-alice-after-concurrent-edit");
await shot(pageB, "07-bob-after-concurrent-edit");

// innerText() would also pick up the collaboration-caret cursor label text
// (e.g. "Bob Visual") since it's rendered as a DOM decoration inside the
// contenteditable at the cursor's position — strip those out first so we're
// comparing actual document content, not cursor chrome.
const extractDocText = (el) => {
  const clone = el.cloneNode(true);
  clone.querySelectorAll(".collaboration-carets__caret, .collaboration-carets__label").forEach((n) => n.remove());
  return clone.textContent;
};
const textA = await pageA.locator(".ProseMirror").evaluate(extractDocText);
const textB = await pageB.locator(".ProseMirror").evaluate(extractDocText);
console.log("Alice sees:", JSON.stringify(textA));
console.log("Bob sees:  ", JSON.stringify(textB));
console.log("Converged:", textA === textB);

// --- Presence bar should show 2 avatars on Alice's screen now ---
const presenceCount = await pageA.locator(".presence-avatar").count();
console.log("Presence avatars visible to Alice:", presenceCount);

await browser.close();

if (textA !== textB) {
  console.error("FAIL: visible editor text diverged between browsers.");
  process.exit(1);
}
if (presenceCount < 1) {
  console.error("FAIL: no presence avatar rendered for the other user.");
  process.exit(1);
}
console.log("PASS: real-browser collaborative session converged and presence rendered.");
