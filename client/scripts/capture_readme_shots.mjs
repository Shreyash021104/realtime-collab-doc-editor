// Regenerates the screenshots embedded in the root README. Not a test —
// run manually after a UI change that should be reflected there.
//
// Usage: node scripts/capture_readme_shots.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import path from "node:path";

const baseUrl = process.argv[2] ?? "https://client-six-iota-77.vercel.app";
const outDir = process.argv[3] ?? path.join(import.meta.dirname, "..", "..", "docs", "screenshots");
const suffix = Date.now();

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const pageA = await ctxA.newPage();
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const pageB = await ctxB.newPage();

async function shot(page, name, height = 300) {
  await page.screenshot({
    path: path.join(outDir, name),
    clip: { x: 0, y: 0, width: 1280, height },
  });
}

// Register Alice, land on empty dashboard
await pageA.goto(`${baseUrl}/login`);
await pageA.getByText("Need an account? Sign up").click();
await pageA.getByLabel("Name").fill("Alice Chen");
await pageA.getByLabel("Email").fill(`alice-readme-${suffix}@example.com`);
await pageA.getByLabel("Password").fill("password123");
await pageA.getByRole("button", { name: "Sign up" }).click();
await pageA.waitForURL("**/documents");

// Create a couple of documents for a nicer dashboard shot
await pageA.getByRole("button", { name: "+ New document" }).click();
await pageA.waitForURL("**/documents/*");
await pageA.locator(".ProseMirror").click();
await pageA.keyboard.type("Q3 Roadmap Draft");
await pageA.locator(".title-input").click();
await pageA.locator(".title-input").fill("Q3 Roadmap");
await pageA.locator(".title-input").blur();
await pageA.getByRole("button", { name: "← Documents" }).click();
await pageA.waitForURL("**/documents");
await pageA.getByRole("button", { name: "+ New document" }).click();
await pageA.waitForURL("**/documents/*");
await pageA.locator(".title-input").fill("Meeting Notes");
await pageA.locator(".title-input").blur();
await pageA.getByRole("button", { name: "← Documents" }).click();
await pageA.waitForURL("**/documents");
await pageA.waitForTimeout(500);
await shot(pageA, "dashboard.png", 290);

// Open the roadmap doc, share it as editor
await pageA.getByText("Q3 Roadmap").click();
await pageA.waitForURL("**/documents/*");
await pageA.locator(".sync-connected").waitFor({ timeout: 15000 });
await pageA.locator(".ProseMirror").click();
await pageA.keyboard.type("Real time collaborative editing built on Yjs CRDTs.");
await pageA.keyboard.press("Enter");
await pageA.keyboard.type("Sync protocol, presence and live cursors, and role based share links are all working end to end.");
await pageA.getByRole("button", { name: "Share" }).click();
await pageA.getByLabel("Access level").selectOption("editor");
await pageA.getByRole("button", { name: "Generate link" }).click();
await pageA.waitForTimeout(300);
await shot(pageA, "share-dialog.png", 520);
const shareLink = await pageA.locator(".share-link-row input").inputValue();
await pageA.getByRole("button", { name: "Close" }).click();

// Bob joins and both type, for a two-cursor screenshot
await pageB.goto(`${baseUrl}/login`);
await pageB.getByText("Need an account? Sign up").click();
await pageB.getByLabel("Name").fill("Marcus Lee");
await pageB.getByLabel("Email").fill(`bob-readme-${suffix}@example.com`);
await pageB.getByLabel("Password").fill("password123");
await pageB.getByRole("button", { name: "Sign up" }).click();
await pageB.waitForURL("**/documents");
await pageB.goto(shareLink);
await pageB.waitForURL("**/documents/*");
await pageB.locator(".sync-connected").waitFor({ timeout: 15000 });
// Wait for Alice's two synced paragraphs to actually be in the DOM before
// computing click coordinates off of them — the Yjs doc can have the
// content a render tick before React/ProseMirror paints it.
await pageB.locator(".ProseMirror p").nth(1).waitFor({ timeout: 15000 });
await pageB.waitForTimeout(500);

// Click far to the right of the last paragraph's text so the browser snaps
// the caret to the end of that line, rather than clicking the paragraph
// element itself (which places the caret at the click's nearest text
// offset from the *start*, not necessarily the end).
const editorBox = await pageB.locator(".ProseMirror").boundingBox();
const paragraphBox = await pageB.locator(".ProseMirror p").last().boundingBox();
await pageB.mouse.click(editorBox.x + editorBox.width - 5, paragraphBox.y + paragraphBox.height / 2);
await pageB.keyboard.press("Enter");
await pageB.keyboard.type("Marcus is reviewing this section now.");
await pageA.waitForTimeout(1500);
await shot(pageA, "editor-collab.png", 200);

await browser.close();
console.log("Screenshots saved to", outDir);
