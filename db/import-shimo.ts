import 'dotenv/config';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import matter from 'gray-matter';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { posts, images } from './schema';
import {
  IMG_MIME,
  cleanSlug,
  toSlug,
  deriveTitle,
  makeDescription,
  findImageRefs,
  replaceRef,
} from '../src/lib/import';

const IMPORT_DIR = join(process.cwd(), 'db', 'import');
const AS_DRAFT = process.env.IMPORT_AS_DRAFT === 'true'; // 默认发布

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const imageCache = new Map<string, string>(); // 原始引用 -> /media/<id>
let imgOk = 0;
let imgFail = 0;

// ---- 图片：下载/读取并入库，返回 /media/<id> ----
async function resolveImage(src: string, mdDir: string): Promise<string | null> {
  if (imageCache.has(src)) return imageCache.get(src)!;
  try {
    let buf: Buffer;
    let mime: string;
    let name: string;

    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;]+);base64,(.*)$/s);
      if (!m) return null;
      mime = m[1];
      buf = Buffer.from(m[2], 'base64');
      name = 'inline';
    } else if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) return null;
      mime = res.headers.get('content-type')?.split(';')[0]?.trim() || IMG_MIME[extname(src).toLowerCase()] || 'image/png';
      buf = Buffer.from(await res.arrayBuffer());
      name = basename(new URL(src).pathname) || 'image';
    } else {
      const p = join(mdDir, src.replace(/^\.\//, ''));
      if (!existsSync(p)) return null;
      buf = readFileSync(p);
      mime = IMG_MIME[extname(p).toLowerCase()] || 'application/octet-stream';
      name = basename(p);
    }

    if (!mime.startsWith('image/')) return null;
    const [row] = await db.insert(images).values({ filename: name, mime, data: buf }).returning({ id: images.id });
    const url = `/media/${row.id}`;
    imageCache.set(src, url);
    return url;
  } catch {
    return null;
  }
}

// 收集正文中的图片引用，逐一入库并改写
async function rewriteImages(body: string, mdDir: string): Promise<string> {
  for (const ref of findImageRefs(body)) {
    const url = await resolveImage(ref.src, mdDir);
    if (url) {
      body = replaceRef(body, ref, url);
      imgOk++;
    } else {
      imgFail++;
      console.warn(`  ⚠ 图片跳过: ${ref.src.slice(0, 80)}`);
    }
  }
  return body;
}

// ---- 收集 .md 文件（子文件夹名作分类）----
function collect(dir: string, category: string, out: { full: string; category: string }[]) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collect(full, dir === IMPORT_DIR ? name : category, out);
    } else if (name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'readme.md') {
      out.push({ full, category });
    }
  }
}

async function main() {
  if (!existsSync(IMPORT_DIR)) {
    console.error(`导入目录不存在：${IMPORT_DIR}`);
    process.exit(1);
  }

  const files: { full: string; category: string }[] = [];
  collect(IMPORT_DIR, '未分类', files);

  if (files.length === 0) {
    console.log('db/import/ 下没有 .md 文件，先把石墨导出的 Markdown 放进去。');
    await client.end();
    return;
  }

  // 已有 slug，用于去重
  const existing = await db.select({ slug: posts.slug }).from(posts);
  const used = new Set(existing.map((r) => r.slug));

  let imported = 0;
  for (const { full, category } of files) {
    const raw = readFileSync(full, 'utf-8');
    const { data, content } = matter(raw);
    const fileBase = basename(full);

    const fromH1 = deriveTitle(content.trim(), fileBase.replace(/\.md$/i, ''));
    const title = data.title ?? fromH1.title;
    let body = data.title ? content.trim() : fromH1.body;

    body = await rewriteImages(body, join(full, '..'));

    // slug：优先 frontmatter，其次中文标题转拼音
    let slug = data.slug ? cleanSlug(String(data.slug)) : toSlug(title);
    let base = slug;
    let i = 2;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);

    await db.insert(posts).values({
      slug,
      title,
      description: data.description ?? makeDescription(body),
      body,
      category,
      cover: data.cover ?? null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      draft: data.draft ?? AS_DRAFT,
      pubDate: data.pubDate ? new Date(data.pubDate) : statSync(full).mtime,
    });
    imported++;
    console.log(`  ✓ [${category}] ${title}  →  /blog/${slug}/`);
  }

  console.log(
    `\n导入完成：${imported} 篇，图片 ${imgOk} 成功${imgFail ? ` / ${imgFail} 跳过` : ''}。` +
      `${AS_DRAFT ? '（草稿）' : '（已发布）'}`
  );
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
