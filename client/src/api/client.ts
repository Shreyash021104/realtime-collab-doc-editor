export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000";

export interface User {
  id: string;
  email: string;
  name: string;
  color: string;
}

const TOKEN_KEY = "collab-editor-token";
const USER_KEY = "collab-editor-user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function storeSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  listDocuments: () =>
    request<{
      documents: Array<{
        id: string;
        title: string;
        owner_id: string;
        updated_at: string;
        role: "owner" | "editor" | "viewer";
      }>;
    }>("/api/documents"),
  createDocument: (title: string) =>
    request<{ id: string; title: string }>("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  getDocument: (id: string) =>
    request<{
      document: { id: string; title: string; owner_id: string };
      role: "owner" | "editor" | "viewer";
    }>(`/api/documents/${id}`),
  renameDocument: (id: string, title: string) =>
    request<{ ok: true }>(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  createShareLink: (id: string, role: "editor" | "viewer") =>
    request<{ token: string; role: string }>(`/api/documents/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  joinViaShareLink: (token: string) =>
    request<{ documentId: string; role: string }>(`/api/documents/join/${token}`, {
      method: "POST",
    }),
  listVersions: (id: string) =>
    request<{
      versions: Array<{ id: string; label: string | null; created_at: string }>;
    }>(`/api/documents/${id}/versions`),
};
