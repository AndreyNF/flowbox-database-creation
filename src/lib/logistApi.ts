import { getAccessToken } from "@/lib/auth";

const BASE = "https://functions.poehali.dev/a98ec74e-291f-4f3a-a72a-04666cf4eb33";

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function logistGet(section: string, logistId: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ section, logist_id: logistId, ...extra });
  const res = await fetch(`${BASE}?${p}`, { headers: authHeaders() });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}

export async function logistPost(section: string, logistId: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}?section=${section}&logist_id=${logistId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}
