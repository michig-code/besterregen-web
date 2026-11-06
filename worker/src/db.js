// Gemeinsame Datenbank-Hilfsfunktion (Supabase REST, mit Service-Key nur im Worker)
export async function db(env, method, path, body, opts = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.prefer) headers.Prefer = opts.prefer;
  else if (method === "POST") {
    headers.Prefer = opts.upsert ? "return=minimal,resolution=merge-duplicates" : "return=minimal";
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`supabase ${method} ${path} ${res.status} ${detail}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
