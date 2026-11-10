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

// One app instance runs behind the proxy, so counting failures in memory is enough.
// The counts are lost when the app restarts.
const failures = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
// Three limits: one address trying one account, one account from any address, one address trying any account.
const LIMITS = { pair: 8, email: 20, ip: 40 } as const;
const MAX_TRACKED = 20_000;

const keysFor = (email: string, ip: string) =>
  [[`pair|${email}|${ip}`, LIMITS.pair], [`email|${email}`, LIMITS.email], [`ip|${ip}`, LIMITS.ip]] as const;

function live(key: string) {
  const entry = failures.get(key);
  if (entry && Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return undefined;
  }
  return entry;
}

export function loginBlocked(email: string, ip: string): boolean {
  return keysFor(email, ip).some(([key, max]) => (live(key)?.count ?? 0) >= max);
}
export function recordLoginFailure(email: string, ip: string) {
  if (failures.size > MAX_TRACKED) {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, entry] of failures) if (entry.first < cutoff) failures.delete(key);
    // Still full of live entries: someone is flooding. Drop the oldest half rather than grow without limit.
    if (failures.size > MAX_TRACKED) [...failures.keys()].slice(0, MAX_TRACKED / 2).forEach((key) => failures.delete(key));
  }
  for (const [key] of keysFor(email, ip)) {
    const entry = live(key);
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, first: Date.now() });
  }
}
/** A good login clears that person's own counter, not the wider ones an attacker could be filling. */
export const clearLoginFailures = (email: string, ip: string) => failures.delete(`pair|${email}|${ip}`);
