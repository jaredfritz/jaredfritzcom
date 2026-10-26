import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// The password and service role stay on the server; the browser receives only a user session.
export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
  };
  if (origin === "https://jaredfritz.com") {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  const reply = (status: number, body: object) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin !== "https://jaredfritz.com") return reply(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "Use POST" });
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    return reply(415, { error: "Use JSON" });
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "Enter your password" });
    let raw = "", size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return reply(413, { error: "Request too large" });
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    let body;
    try { body = JSON.parse(raw); }
    catch { return reply(400, { error: "Invalid request" }); }
    if (typeof body?.password !== "string" || !body.password ||
        new TextEncoder().encode(body.password).length > 72)
      return reply(400, { error: "Enter your password" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Global database-backed limit works across instances and trusts no client IP headers.
    const { data: check, error: checkError } = await admin.rpc(
      "check_workout_password", { candidate: body.password },
    );
    if (checkError || !check) throw new Error("Password verifier unavailable");
    if (check.status === "limited") {
      headers["Retry-After"] = "60";
      return reply(429, { error: "Too many attempts. Try again in a minute." });
    }
    if (check.status === "invalid") return reply(401, { error: "Incorrect password" });
    if (check.status !== "ok" || !check.owner_id) throw new Error("Password not configured");
    const { data: owner, error: ownerError } = await admin.auth.admin.getUserById(check.owner_id);
    if (ownerError || !owner.user?.email) throw new Error("Owner unavailable");
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink", email: owner.user.email,
    });
    if (linkError || !link.properties?.hashed_token) throw new Error("Session unavailable");
    const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await auth.auth.verifyOtp({
      token_hash: link.properties.hashed_token, type: "email",
    });
    if (error || !data.session || data.session.user.id !== check.owner_id)
      throw new Error("Session unavailable");
    return reply(200, {
      access_token: data.session.access_token, refresh_token: data.session.refresh_token,
    });
  } catch {
    // Never log passwords, generated links, tokens, or raw Auth errors.
    return reply(503, { error: "Unable to unlock right now. Please try again." });
  }
}
Deno.serve(handleRequest);
