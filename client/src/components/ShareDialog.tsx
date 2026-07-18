import { useState } from "react";
import { api } from "../api/client";

export function ShareDialog({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateLink() {
    const { token } = await api.createShareLink(documentId, role);
    const url = `${window.location.origin}/join/${token}`;
    setLink(url);
    setCopied(false);
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Share document</h2>
        <label>
          Access level
          <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")}>
            <option value="viewer">Viewer (read-only)</option>
            <option value="editor">Editor (can edit)</option>
          </select>
        </label>
        <button onClick={generateLink}>Generate link</button>
        {link && (
          <div className="share-link-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button onClick={copyLink}>{copied ? "Copied!" : "Copy"}</button>
          </div>
        )}
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
