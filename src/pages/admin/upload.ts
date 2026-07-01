import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { images } from '../../../db/schema';

const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: '没有收到文件' }, 400);
  if (!ALLOWED.includes(file.type)) return json({ error: '仅支持 png/jpg/gif/webp/svg' }, 400);
  if (file.size > MAX_SIZE) return json({ error: '图片不能超过 5MB' }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const [row] = await db
    .insert(images)
    .values({ filename: file.name || 'image', mime: file.type, data: buffer })
    .returning({ id: images.id });

  return json({ url: `/media/${row.id}` });
};
