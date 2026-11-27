import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { adminUsers } from '../db/schema.ts';

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: 'Staff' | 'Admin';
  email?: string;
  authMethod: 'password' | 'firebase';
}

export interface AuthRequest extends Request {
  staffUser?: SessionUser;
}

const SESSION_COOKIE_NAME = 'rks_staff_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'rks-samutprakan-acupuncture-session-key-2026'
  );
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function createSessionToken(user: SessionUser): string {
  const payload = {
    ...user,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return {
      id: payload.id,
      username: payload.username,
      fullName: payload.fullName,
      role: payload.role === 'Admin' ? 'Admin' : 'Staff',
      email: payload.email,
      authMethod: payload.authMethod === 'firebase' ? 'firebase' : 'password',
    };
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export async function resolveAuthUser(req: Request): Promise<SessionUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    const parsed = verifySessionToken(cookieToken);
    if (parsed) return parsed;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const sessionParsed = verifySessionToken(token);
    if (sessionParsed) return sessionParsed;

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const email = (decoded.email || '').toLowerCase();
      if (!email) return null;
      const rows = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.email, email))
        .limit(1);
      if (rows.length > 0 && rows[0].isActive) {
        return {
          id: rows[0].adminId,
          username: rows[0].username,
          fullName: rows[0].fullName || decoded.name || email,
          role: rows[0].role === 'Admin' ? 'Admin' : 'Staff',
          email,
          authMethod: 'firebase',
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

export const requireStaff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const user = await resolveAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนดำเนินการ' });
  }
  req.staffUser = user;
  next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const user = await resolveAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบผู้ดูแลระบบก่อนดำเนินการ' });
  }
  if (user.role !== 'Admin') {
    return res.status(403).json({ error: 'สิทธิ์การใช้งานไม่เพียงพอ (ต้องเป็นผู้ดูแลระบบเท่านั้น)' });
  }
  req.staffUser = user;
  next();
};

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim().slice(0, 48);
  }
  return (req.socket?.remoteAddress || 'unknown').slice(0, 48);
}
