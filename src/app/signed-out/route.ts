export const dynamic = "force-dynamic";

/**
 * Reached right after logging out. Photos are cached in the browser for a day, so the next person
 * on a shared computer could find them there. This empties the cache, then goes to the login.
 */
export function GET() {
  return new Response(null, { status: 303, headers: { Location: "/login", "Clear-Site-Data": '"cache"', "Cache-Control": "no-store" } });
}
