import type { PresentUser } from "../hooks/useAwareness";

export function PresenceBar({ users }: { users: PresentUser[] }) {
  if (users.length === 0) return null;
  return (
    <div className="presence-bar">
      {users.map((u) => (
        <span
          key={u.clientId}
          className="presence-avatar"
          style={{ backgroundColor: u.color }}
          title={u.name}
        >
          {u.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
