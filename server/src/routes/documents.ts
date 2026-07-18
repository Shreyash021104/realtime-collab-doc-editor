import { Router } from "express";
import { query } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { atLeast, getRole, type DocRole } from "../permissions.js";
import { listPresence } from "../redis.js";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// List every document the current user has at least viewer access to.
documentsRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const result = await query(
    `SELECT d.id, d.title, d.owner_id, d.updated_at, p.role
     FROM documents d
     JOIN document_permissions p ON p.document_id = d.id
     WHERE p.user_id = $1
     ORDER BY d.updated_at DESC`,
    [userId]
  );
  res.json({ documents: result.rows });
});

documentsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const title =
    typeof req.body?.title === "string" && req.body.title.trim()
      ? req.body.title.trim()
      : "Untitled document";

  const doc = await query<{ id: string }>(
    "INSERT INTO documents (title, owner_id) VALUES ($1, $2) RETURNING id",
    [title, userId]
  );
  const documentId = doc.rows[0].id;
  await query(
    "INSERT INTO document_permissions (document_id, user_id, role) VALUES ($1, $2, 'owner')",
    [documentId, userId]
  );
  res.status(201).json({ id: documentId, title });
});

documentsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const role = await getRole(String(req.params.id), userId);
  if (!role) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const result = await query(
    "SELECT id, title, owner_id, created_at, updated_at FROM documents WHERE id = $1",
    [String(req.params.id)]
  );
  if (!result.rowCount) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ document: result.rows[0], role });
});

documentsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const role = await getRole(String(req.params.id), userId);
  if (!role || !atLeast(role, "editor")) {
    res.status(403).json({ error: "Editor access required" });
    return;
  }
  const title = req.body?.title;
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  await query(
    "UPDATE documents SET title = $1, updated_at = now() WHERE id = $2",
    [title.trim(), String(req.params.id)]
  );
  res.json({ ok: true });
});

// Generate (or rotate) a shareable link that grants `role` to anyone who
// redeems it. This is the "share a link" flow described in the product spec.
documentsRouter.post("/:id/share", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const role = await getRole(String(req.params.id), userId);
  if (!role || !atLeast(role, "owner")) {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  const shareRole: DocRole = req.body?.role === "editor" ? "editor" : "viewer";
  const result = await query<{ token: string }>(
    "INSERT INTO document_share_links (document_id, role) VALUES ($1, $2) RETURNING token",
    [String(req.params.id), shareRole]
  );
  res.status(201).json({ token: result.rows[0].token, role: shareRole });
});

// Redeem a share link: grants the current user access at the link's role
// (never downgrades an existing higher role).
documentsRouter.post("/join/:token", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const link = await query<{ document_id: string; role: DocRole }>(
    "SELECT document_id, role FROM document_share_links WHERE token = $1",
    [String(req.params.token)]
  );
  if (!link.rowCount) {
    res.status(404).json({ error: "Invalid or expired share link" });
    return;
  }
  const { document_id: documentId, role } = link.rows[0];
  const existingRole = await getRole(documentId, userId);
  if (!existingRole || !atLeast(existingRole, role)) {
    await query(
      `INSERT INTO document_permissions (document_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [documentId, userId, role]
    );
  }
  res.json({ documentId, role: existingRole && atLeast(existingRole, role) ? existingRole : role });
});

documentsRouter.get("/:id/presence", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const role = await getRole(String(req.params.id), userId);
  if (!role) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ presence: await listPresence(String(req.params.id)) });
});

documentsRouter.get("/:id/versions", async (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const role = await getRole(String(req.params.id), userId);
  if (!role) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const result = await query(
    "SELECT id, label, created_at FROM document_snapshots WHERE document_id = $1 ORDER BY created_at DESC LIMIT 50",
    [String(req.params.id)]
  );
  res.json({ versions: result.rows });
});
