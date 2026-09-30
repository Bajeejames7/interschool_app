import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { one } from "./db.js";

export type Role = "user" | "admin";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

/** What the app is told about the signed-in person. */
export interface Me extends User {
  isCreator: boolean;
  isAdmin: boolean;
  /** Program ids this person coordinates (admin for that program only). */
  coordinates: number[];
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) {
    super(message);
  }
}

// ---- tokens -----------------------------------------------------------------
// {userId}.{nonce}.{issuedAt}.{hmac}. Stateless and unforgeable without the
// secret. Valid for 60 days, then the person signs in again.

const TOKEN_DAYS = 60;

function sign(payload: string): string {
  return createHmac("sha256", config.tokenSecret).update(payload).digest("base64url");
}

export function issueToken(userId: number): string {
  const payload = `${userId}.${randomBytes(12).toString("base64url")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const expected = Buffer.from(sign(parts.slice(0, 3).join(".")));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const userId = Number(parts[0]);
  const issued = Number(parts[2]);
  if (!Number.isInteger(userId) || !Number.isFinite(issued)) return null;
  if (Date.now() - issued > TOKEN_DAYS * 24 * 60 * 60 * 1000) return null;
  return userId;
}

// ---- who is asking ------------------------------------------------------------

export function isCreatorEmail(email: string): boolean {
  return config.creatorEmail !== "" && email.trim().toLowerCase() === config.creatorEmail;
}

export async function loadMe(userId: number): Promise<Me | null> {
  const row = await one<User & { coordinates: number[] }>(
    `SELECT u.id, u.email, u.name, u.role,
            coalesce(array_agg(pa.program_id) FILTER (WHERE pa.program_id IS NOT NULL), '{}') AS coordinates
       FROM users u LEFT JOIN program_admins pa ON pa.user_id = u.id
      WHERE u.id = $1 GROUP BY u.id`,
    [userId],
  );
  if (!row) return null;
  const isCreator = isCreatorEmail(row.email);
  return { ...row, isCreator, isAdmin: isCreator || row.role === "admin" };
}

export function me(req: Request): Me {
  const found = (req as Request & { me?: Me }).me;
  if (!found) throw new HttpError(401, "Please sign in");
  return found;
}

/** Every API route except sign-up and sign-in sits behind this. */
export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const userId = header.startsWith("Bearer ") ? readToken(header.slice(7)) : null;
  const found = userId === null ? null : await loadMe(userId);
  if (!found) throw new HttpError(401, "Please sign in");
  (req as Request & { me?: Me }).me = found;
  next();
}

// ---- what they may do -----------------------------------------------------------

export function requireAdmin(user: Me): void {
  if (!user.isAdmin) throw new HttpError(403, "Only admins can do this");
}

/** Admins manage every program; a coordinator manages their own. */
export function canManage(user: Me, programId: number): boolean {
  return user.isAdmin || user.coordinates.includes(programId);
}

export function requireManager(user: Me, programId: number): void {
  if (!canManage(user, programId)) {
    throw new HttpError(403, "Only admins and this program's coordinator can change this");
  }
}

// ---- sign-in attempts -----------------------------------------------------------
// 10 failed attempts per email+IP in 15 minutes, then a wait. In memory: the
// app runs as one small server.

const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

export function checkLoginAllowed(key: string): void {
  const entry = failures.get(key);
  if (entry && Date.now() - entry.since < WINDOW_MS && entry.count >= 10) {
    throw new HttpError(429, "Too many failed attempts. Wait 15 minutes and try again.");
  }
}

export function noteLoginFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.since >= WINDOW_MS) failures.set(key, { count: 1, since: Date.now() });
  else entry.count += 1;
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
