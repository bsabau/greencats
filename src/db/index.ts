import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// The fallback lets `next build` load this module without a database. No query runs at build time.
const url = process.env.DATABASE_URL ?? "postgres://build@127.0.0.1:1/build";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
export const pg = globalForDb.pg ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pg = pg;

export const db = drizzle(pg, { schema });
export { schema };
