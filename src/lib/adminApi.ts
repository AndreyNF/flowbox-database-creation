import { getAccessToken } from "@/lib/auth";

const BASE = "https://functions.poehali.dev/e84c327c-24be-4c03-9afc-931c9b5267ff";

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function adminGet(section: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ section, ...extra });
  const res = await fetch(`${BASE}?${p}`, { headers: authHeaders() });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}

export async function adminPost(section: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}?section=${section}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}
