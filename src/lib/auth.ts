import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, lt, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { can, type Permission } from "./permissions";

const COOKIE = "gc_session";
const SESSION_DAYS = 14;
const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
/** A session unused for this many days ends, even inside its 14 days. Set SESSION_IDLE_DAYS to change it. */
const idleMs = () => positiveInt(process.env.SESSION_IDLE_DAYS, 7) * 86_400_000;
const TOUCH_MS = 3_600_000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const hashPassword = (password: string) => hash(password);
let dummyHash: Promise<string> | undefined;
/** A fixed hash to check against when the account doesn't exist, so both cases take the same time. */
export const placeholderHash = () => (dummyHash ??= hash(randomBytes(16).toString("hex")));
export const verifyPassword = (stored: string, password: string) => verify(stored, password);

const secureCookie = () =>
  process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";

export async function startSession(userId: string, locale: "ro" | "en") {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(s.sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", expires: expiresAt });
  jar.set("locale", locale, { sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 31_536_000 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(s.sessions).where(eq(s.sessions.tokenHash, sha256(token)));
  jar.delete(COOKIE);
}

export const currentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const now = Date.now();
  const [row] = await db
    .select({ user: s.users, lastSeenAt: s.sessions.lastSeenAt })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(
      eq(s.sessions.tokenHash, tokenHash),
      gt(s.sessions.expiresAt, new Date(now)),
      gt(s.sessions.lastSeenAt, new Date(now - idleMs())),
      eq(s.users.active, true),
    ));
  if (!row) return null;
  // Written at most once an hour, so normal browsing doesn't add a database write per page.
  if (now - row.lastSeenAt.getTime() > TOUCH_MS) {
    await db.update(s.sessions).set({ lastSeenAt: new Date(now) }).where(eq(s.sessions.tokenHash, tokenHash));
  }
  return row.user;
});

export type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser({ allowPasswordChange = false } = {}): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !allowPasswordChange) redirect("/account?error=must_change");
  return user;
}

export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/?error=denied");
  return user;
}

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: unknown,
) {
  await db.insert(s.auditLog).values({ userId, action, entity, entityId, detail: detail ?? null });
}

/** Removes sessions that can no longer be used. Called at login, so the table doesn't grow forever. */
export async function deleteDeadSessions() {
  const now = Date.now();
  await db.delete(s.sessions).where(or(lt(s.sessions.expiresAt, new Date(now)), lt(s.sessions.lastSeenAt, new Date(now - idleMs()))));
}

