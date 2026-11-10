import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [photo] = await db.select().from(s.photos).where(eq(s.photos.id, id));
  if (!photo) return new Response("Not found", { status: 404 });
  const data = await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./uploads", path.basename(photo.fileName)));
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=86400" },
  });
}
