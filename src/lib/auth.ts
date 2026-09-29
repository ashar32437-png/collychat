import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { store } from "./store";
import {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./types";
import type { User } from "./types";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

// ---------------------------------------------------------- password hashing

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 32);
  return "scrypt:" + salt + ":" + key.toString("hex");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  if (expected.length === 0) return false;
  const key = await scrypt(password, salt, expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ------------------------------------------------------------------ Sessions

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return store.getSessionUser(sha256(token));
}

export function sessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

// --------------------------------------------------------------- validation

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    return (
      "Username must be " +
      MIN_USERNAME_LENGTH +
      "-" +
      MAX_USERNAME_LENGTH +
      " characters"
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return "Use letters, numbers, dots, dashes or underscores";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Password must be at least " + MIN_PASSWORD_LENGTH + " characters";
  }
  if (password.length > 200) return "That password is too long";
  return null;
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateDisplayName(displayName: string): string | null {
  if (displayName.length < 1 || displayName.length > 32) {
    return "Display name must be 1-32 characters";
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(displayName)) {
    return "Use letters, numbers, spaces, dots, dashes or underscores";
  }
  return null;
}

// --------------------------------------------------- Best-effort login throttle

const attempts = new Map<string, { count: number; first: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function tooManyAttempts(key: string): boolean {
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() - record.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const record = attempts.get(key);
  if (!record || Date.now() - record.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
    return;
  }
  record.count += 1;
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
