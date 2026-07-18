import { useEffect, useState } from "react";
import type { WebsocketProvider } from "y-websocket";

export interface PresentUser {
  clientId: number;
  name: string;
  color: string;
}

export function useAwareness(provider: WebsocketProvider | undefined): PresentUser[] {
  const [users, setUsers] = useState<PresentUser[]>([]);

  useEffect(() => {
    if (!provider) return;
    const awareness = provider.awareness;
    const update = () => {
      const states = [...awareness.getStates().entries()]
        .filter(([, state]) => state.user)
        .map(([clientId, state]) => ({
          clientId,
          name: state.user.name as string,
          color: state.user.color as string,
        }));
      setUsers(states);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider]);

  return users;
}
