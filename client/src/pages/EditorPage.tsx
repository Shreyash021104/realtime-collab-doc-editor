import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCollabDoc } from "../hooks/useCollabDoc";
import { useAwareness } from "../hooks/useAwareness";
import { PresenceBar } from "../components/PresenceBar";
import { ShareDialog } from "../components/ShareDialog";
import { VersionHistory } from "../components/VersionHistory";

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [role, setRole] = useState<"owner" | "editor" | "viewer" | null>(null);
  const [title, setTitle] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [notFound, setNotFound] = useState(false);

  if (!id) throw new Error("EditorPage requires a document id");

  const { ydoc, provider, status } = useCollabDoc(id);
  const users = useAwareness(provider);
  const canWrite = role === "owner" || role === "editor";

  useEffect(() => {
    api
      .getDocument(id)
      .then(({ document, role }) => {
        setTitle(document.title);
        setRole(role);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const extensions: AnyExtension[] = [StarterKit.configure({ undoRedo: false })];
  if (ydoc) extensions.push(Collaboration.configure({ document: ydoc }));
  if (provider) {
    extensions.push(
      CollaborationCaret.configure({
        provider,
        user: { name: user?.name ?? "Anonymous", color: user?.color ?? "#888" },
      })
    );
  }

  // ydoc/provider are only available once useCollabDoc's effect has run
  // (see its comment on why acquisition is effect-driven rather than
  // memoized), so the editor briefly mounts without collaboration wired up
  // and gets recreated once they're ready.
  const editor = useEditor({ extensions, editable: canWrite }, [ydoc, provider, canWrite]);

  useEffect(() => {
    editor?.setEditable(canWrite);
  }, [editor, canWrite]);

  async function saveTitle() {
    if (!id || !canWrite) return;
    await api.renameDocument(id, title || "Untitled document");
  }

  if (notFound) {
    return (
      <div className="editor-page">
        <p>You don't have access to this document.</p>
        <button onClick={() => navigate("/documents")}>Back to documents</button>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <button className="link-button" onClick={() => navigate("/documents")}>
          ← Documents
        </button>
        <input
          className="title-input"
          value={title}
          disabled={!canWrite}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
        />
        <span className={`sync-status sync-${status}`}>{status}</span>
        {role === "viewer" && <span className="viewer-badge">Read-only</span>}
        <PresenceBar users={users} />
        <div className="header-actions">
          {role === "owner" && (
            <button onClick={() => setShowShare(true)}>Share</button>
          )}
          <button onClick={() => setShowVersions(true)}>History</button>
        </div>
      </header>

      <EditorContent className="editor-content" editor={editor} />

      {showShare && id && (
        <ShareDialog documentId={id} onClose={() => setShowShare(false)} />
      )}
      {showVersions && id && (
        <VersionHistory documentId={id} onClose={() => setShowVersions(false)} />
      )}
    </div>
  );
}
