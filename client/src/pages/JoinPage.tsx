import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (!user) {
      // Preserve the destination so login can bounce back here.
      navigate(`/login?redirect=/join/${token}`);
      return;
    }
    api
      .joinViaShareLink(token)
      .then(({ documentId }) => navigate(`/documents/${documentId}`))
      .catch(() => setError("That share link is invalid or has expired."));
  }, [token, user, navigate]);

  if (error) {
    return (
      <div className="editor-page">
        <p>{error}</p>
        <button onClick={() => navigate("/documents")}>Back to documents</button>
      </div>
    );
  }

  return <div className="editor-page">Joining document…</div>;
}
