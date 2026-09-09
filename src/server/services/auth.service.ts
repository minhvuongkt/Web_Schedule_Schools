import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/domain/password";
import { isRole, type Role } from "@/server/domain/roles";

/**
 * Credential auth: login, logout, session resolution.
 *
 * Session tokens: the cookie carries a 32-byte random value; the database
 * stores only its SHA-256, so a database leak cannot be replayed as valid
 * sessions. Lookups are constant-work by the unique token hash.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "stk_session";

export class AuthenticationError extends Error {
  readonly code = "INVALID_CREDENTIALS";
  constructor() {
    super("Sai tên đăng nhập hoặc mật khẩu.");
    this.name = "AuthenticationError";
  }
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  teacherId: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  teacher: { id: string } | null;
}): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: isRole(user.role) ? user.role : "TEACHER",
    teacherId: user.teacher?.id ?? null,
  };
}

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  isActive: true,
  passwordHash: true,
  teacher: { select: { id: true } },
} as const;

/**
 * Verifies credentials and creates a session.
 * @returns the raw cookie token (caller sets the cookie) + user DTO.
 */
export async function login(username: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const user = await prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
    select: USER_SELECT,
  });
  // Always run a hash comparison to keep timing roughly constant whether or
  // not the user exists (mitigates username enumeration via response time).
  const stored =
    user?.passwordHash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const ok = verifyPassword(password, stored) && user !== null && user.isActive;
  if (!ok) {
    throw new AuthenticationError();
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      token: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { token, user: sanitizeUser(user) };
}

/** Deletes the session bound to the cookie token (if any). */
export async function logout(token: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { token: sha256(token) } });
}

/** Resolves the session user from a cookie token, or null. */
export async function resolveSessionUser(token: string): Promise<SessionUser | null> {
  const session = await prisma.authSession.findUnique({
    where: { token: sha256(token) },
    select: {
      expiresAt: true,
      user: { select: USER_SELECT },
    },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await prisma.authSession.delete({ where: { token: sha256(token) } }).catch(() => undefined);
    }
    return null;
  }
  if (!session.user.isActive) return null;
  return sanitizeUser(session.user);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
