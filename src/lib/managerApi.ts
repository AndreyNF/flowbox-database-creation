const BASE = "https://functions.poehali.dev/d7f531c8-aca4-4209-b3ac-dcaa6a264536";

export async function mgrGet(section: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ section, ...extra });
  const res = await fetch(`${BASE}?${p}`);
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}

export async function mgrPost(section: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}?section=${section}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(json.error || "Ошибка");
  return json;
}
