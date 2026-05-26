const AUTH_URL = "https://functions.poehali.dev/206b7cf7-17ff-42fb-a979-aba133e822f9";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "client" | "logist";
  company_id: string | null;
  last_login_at?: string | null;
}

const STORAGE_KEY = "flowbox_auth";

interface StoredAuth {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

// ── storage ─────────────────────────────────────────────────────────────────

export function getStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(data: StoredAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken(): string | null {
  return getStoredAuth()?.access_token ?? null;
}

export function getCurrentUser(): AuthUser | null {
  return getStoredAuth()?.user ?? null;
}

// ── api calls ────────────────────────────────────────────────────────────────

async function authPost(body: Record<string, unknown>) {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка авторизации");
  return json;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await authPost({ action: "login", email, password });
  setStoredAuth({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
  return data.user;
}

export async function logout() {
  const stored = getStoredAuth();
  if (stored) {
    try { await authPost({ action: "logout", token: stored.access_token }); } catch { /* ignore */ }
  }
  clearStoredAuth();
}

export async function refreshToken(): Promise<string | null> {
  const stored = getStoredAuth();
  if (!stored?.refresh_token) return null;
  try {
    const data = await authPost({ action: "refresh", refresh_token: stored.refresh_token });
    setStoredAuth({ ...stored, access_token: data.access_token, user: data.user });
    return data.access_token;
  } catch {
    clearStoredAuth();
    return null;
  }
}

export async function me(token: string): Promise<AuthUser> {
  const data = await authPost({ action: "me", token });
  return data.user;
}

export async function registerUser(adminToken: string, payload: {
  name: string; email: string; password: string;
  role: "admin" | "manager" | "client"; company_id?: string;
}) {
  return authPost({ action: "register", admin_token: adminToken, ...payload });
}

export async function changePassword(token: string, old_password: string, new_password: string) {
  return authPost({ action: "change_password", token, old_password, new_password });
}

// ── redirect helper ──────────────────────────────────────────────────────────

export function getHomeByRole(role: AuthUser["role"]): string {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  if (role === "client") return "/client";
  if (role === "logist") return "/logist";
  return "/login";
}