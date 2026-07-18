import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Version {
  id: string;
  label: string | null;
  created_at: string;
}

export function VersionHistory({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listVersions(documentId)
      .then(({ versions }) => setVersions(versions))
      .finally(() => setLoading(false));
  }, [documentId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Version history</h2>
        {loading ? (
          <p>Loading…</p>
        ) : versions.length === 0 ? (
          <p>No snapshots yet — they're captured automatically every ~2 minutes of active editing.</p>
        ) : (
          <ul className="version-list">
            {versions.map((v) => (
              <li key={v.id}>{v.label ?? new Date(v.created_at).toLocaleString()}</li>
            ))}
          </ul>
        )}
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
