import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface DocRow {
  id: string;
  title: string;
  updated_at: string;
  role: "owner" | "editor" | "viewer";
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareToken, setShareToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function refresh() {
    setLoading(true);
    try {
      const { documents } = await api.listDocuments();
      setDocuments(documents);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createDocument() {
    const doc = await api.createDocument("Untitled document");
    navigate(`/documents/${doc.id}`);
  }

  async function joinShareLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const trimmed = shareToken.trim();
      // Accept either a raw token or a full share URL.
      const token = trimmed.includes("/join/") ? trimmed.split("/join/")[1] : trimmed;
      const { documentId } = await api.joinViaShareLink(token);
      navigate(`/documents/${documentId}`);
    } catch {
      setError("That share link doesn't look valid.");
    }
  }

  return (
    <div className="documents-page">
      <header className="documents-header">
        <h1>Documents</h1>
        <div className="header-actions">
          <span>{user?.name}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      <div className="documents-toolbar">
        <button onClick={createDocument}>+ New document</button>
        <form onSubmit={joinShareLink} className="join-form">
          <input
            placeholder="Paste a share link or token to join"
            value={shareToken}
            onChange={(e) => setShareToken(e.target.value)}
          />
          <button type="submit">Join</button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : documents.length === 0 ? (
        <p>No documents yet — create one to get started.</p>
      ) : (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <a
                href={`/documents/${doc.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/documents/${doc.id}`);
                }}
              >
                <span className="doc-title">{doc.title}</span>
                <span className={`role-badge role-${doc.role}`}>{doc.role}</span>
                <span className="doc-updated">
                  {new Date(doc.updated_at).toLocaleString()}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
