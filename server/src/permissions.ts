import { query } from "./db.js";

export type DocRole = "owner" | "editor" | "viewer";

const RANK: Record<DocRole, number> = { viewer: 0, editor: 1, owner: 2 };

export function atLeast(role: DocRole, minimum: DocRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export async function getRole(
  documentId: string,
  userId: string
): Promise<DocRole | null> {
  const result = await query<{ role: DocRole }>(
    "SELECT role FROM document_permissions WHERE document_id = $1 AND user_id = $2",
    [documentId, userId]
  );
  return result.rows[0]?.role ?? null;
}
