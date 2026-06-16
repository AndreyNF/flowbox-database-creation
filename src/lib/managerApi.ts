import { getAccessToken } from "@/lib/auth";

const BASE = "https://functions.poehali.dev/d7f531c8-aca4-4209-b3ac-dcaa6a264536";
export const CLAIMS_API = "https://functions.poehali.dev/41c8e826-0ec2-4029-a582-d1507758a0ef";

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function claimsApiGet(section: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ section, ...extra });
  const res = await fetch(`${CLAIMS_API}?${p}`, { headers: authHeaders() });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}

export async function claimsApiPost(section: string, body: Record<string, unknown>) {
  const res = await fetch(`${CLAIMS_API}?section=${section}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}

export async function mgrGet(section: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ section, ...extra });
  const res = await fetch(`${BASE}?${p}`, { headers: authHeaders() });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}

export async function mgrPost(section: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}?section=${section}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}
