import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";

const VALIDATE_URL = process.env.SILVERBACKBASE_URL
  ? `${process.env.SILVERBACKBASE_URL}/api/tokens/validate`
  : null;

const TRAIL_SECRET = process.env.TRAIL_VALIDATE_SECRET ?? "";

type CacheEntry = { valid: boolean; scopes: string[]; expires: number };
const cache = new Map<string, CacheEntry>();

async function validateToken(hash: string): Promise<{ valid: boolean; scopes: string[] }> {
  const cached = cache.get(hash);
  if (cached && cached.expires > Date.now()) {
    return { valid: cached.valid, scopes: cached.scopes };
  }

  if (!VALIDATE_URL) {
    // No website configured — dev mode, allow all
    return { valid: true, scopes: ["*"] };
  }

  try {
    const res = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-trail-secret": TRAIL_SECRET },
      body: JSON.stringify({ hash }),
    });
    const data = await res.json() as { valid: boolean; scopes: string[] };
    cache.set(hash, { ...data, expires: Date.now() + 60_000 });
    return data;
  } catch {
    return { valid: false, scopes: [] };
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized — provide Authorization: Bearer <token>" }, 401);
  }

  const token = auth.slice(7).trim();
  const hash = createHash("sha256").update(token).digest("hex");
  const { valid } = await validateToken(hash);

  if (!valid) return c.json({ error: "Invalid or revoked token" }, 401);

  await next();
};
