/** Limits on password guessing. Kept apart from the database code so it can be tested on its own. */

// One app instance runs behind the proxy, so counting failures in memory is enough.
// The counts are lost when the app restarts.
const failures = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
// One address trying one account, one address trying any account, and one account from any address.
// The last one stops guessing spread over many addresses. It would also let anyone lock a person out,
// so the right password from an address that has logged in to that account before still passes.
const LIMITS = { pair: 8, ip: 40, email: 30, passwordChange: 5 } as const;
const MAX_TRACKED = 20_000;
// Addresses each account logged in from, kept for 30 days.
const knownAddresses = new Map<string, number>();
const KNOWN_MS = 30 * 24 * 3600_000;

const keysFor = (email: string, ip: string) =>
  [[`pair|${email}|${ip}`, LIMITS.pair], [`ip|${ip}`, LIMITS.ip], [`email|${email}`, LIMITS.email]] as const;

function live(key: string) {
  const entry = failures.get(key);
  if (entry && Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return undefined;
  }
  return entry;
}
const over = (key: string, max: number) => (live(key)?.count ?? 0) >= max;

function count(key: string) {
  if (failures.size >= MAX_TRACKED) makeRoom();
  const entry = live(key);
  if (entry) entry.count += 1;
  else failures.set(key, { count: 1, first: Date.now() });
}

/**
 * Someone is flooding the table with made-up accounts. Expired entries go first, then single failures,
 * oldest first, so the counters of an account under real attack survive.
 */
function makeRoom() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of failures) if (entry.first < cutoff) failures.delete(key);
  for (const [key, entry] of failures) {
    if (failures.size < MAX_TRACKED / 2) return;
    if (entry.count === 1) failures.delete(key);
  }
  for (const key of failures.keys()) {
    if (failures.size < MAX_TRACKED / 2) return;
    failures.delete(key);
  }
}

/**
 * "blocked": refuse before checking the password. "known_only": too many failures for this account
 * from everywhere; only an address it has logged in from before may try.
 */
export function loginLimit(email: string, ip: string): "ok" | "blocked" | "known_only" {
  if (over(`pair|${email}|${ip}`, LIMITS.pair) || over(`ip|${ip}`, LIMITS.ip)) return "blocked";
  if (over(`email|${email}`, LIMITS.email)) return isKnownAddress(email, ip) ? "known_only" : "blocked";
  return "ok";
}
export function recordLoginFailure(email: string, ip: string) {
  for (const [key] of keysFor(email, ip)) count(key);
}
function isKnownAddress(email: string, ip: string) {
  const seen = knownAddresses.get(`${email}|${ip}`);
  return seen !== undefined && Date.now() - seen < KNOWN_MS;
}
/** A good login clears that person's own counter, not the wider ones an attacker could be filling. */
export function recordLoginSuccess(email: string, ip: string) {
  failures.delete(`pair|${email}|${ip}`);
  if (knownAddresses.size >= MAX_TRACKED) {
    const cutoff = Date.now() - KNOWN_MS;
    for (const [key, seen] of knownAddresses) if (seen < cutoff) knownAddresses.delete(key);
    if (knownAddresses.size >= MAX_TRACKED) knownAddresses.delete(knownAddresses.keys().next().value!);
  }
  knownAddresses.delete(`${email}|${ip}`);
  knownAddresses.set(`${email}|${ip}`, Date.now());
}

/** Wrong current passwords when changing it. A stolen session can't be used to guess the password. */
export const passwordChangeBlocked = (userId: string) => over(`pw|${userId}`, LIMITS.passwordChange);
export const recordPasswordChangeFailure = (userId: string) => count(`pw|${userId}`);
