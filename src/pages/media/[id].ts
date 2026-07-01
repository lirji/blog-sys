import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { images } from '../../../db/schema';

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return new Response(null, { status: 404 });

  const [row] = await db.select().from(images).where(eq(images.id, id)).limit(1);
  if (!row) return new Response(null, { status: 404 });

  return new Response(row.data, {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
