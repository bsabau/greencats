import "server-only";
import { deleteDeadSessions } from "@/lib/auth";
import { purgeOldAuditEntries } from "@/lib/retention";

const DAY_MS = 24 * 3600_000;

/** Removes old change-log entries and dead sessions once a day, even when nobody logs in. */
export function startDailyCleanup() {
  const run = () =>
    Promise.all([purgeOldAuditEntries(), deleteDeadSessions()]).catch((error) => console.error("Daily cleanup failed:", error));
  // A minute after start, so it doesn't compete with the first requests, then every day.
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY_MS).unref();
}
