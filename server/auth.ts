import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getDb } from "./db.ts";

const COOKIE_NAME = "cinevae_session";
const SECRET =
  process.env.SESSION_SECRET || "cinevae-academic-dev-secret-key-2026";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_demo: boolean;
  created_at: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function signToken(payload: { userId: number; exp: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): { userId: number; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

export function createSessionToken(userId: number): string {
  return signToken({
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
  });
}

export function setSessionCookie(res: Response, userId: number): string {
  const token = createSessionToken(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
  return token;
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    path: "/",
    sameSite: "none",
    secure: true,
  });
}

export function getRequestUser(req: Request): AuthUser | null {
  let token: string | undefined;

  // 1. Prefer Authorization: Bearer <token> header (works reliably inside cross-origin iframes)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  // 2. Fallback to session cookie
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[COOKIE_NAME];
  }

  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, email, display_name, avatar_url, is_demo, created_at FROM users WHERE id = ?"
    )
    .get(payload.userId) as (Omit<AuthUser, "is_demo"> & { is_demo?: number }) | undefined;
  if (!row) return null;
  return {
    ...row,
    is_demo: Boolean(row.is_demo) || row.email === "demo@cinevae.edu",
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return;
  }
  (req as Request & { user: AuthUser }).user = user;
  next();
}
