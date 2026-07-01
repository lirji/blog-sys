import 'dotenv/config';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { posts, type NewPostRow } from './schema';

const SEED_DIR = join(process.cwd(), 'db', 'seed');

// 递归收集 db/seed 下的 .md，子文件夹名作为分类
function collect(dir: string, category: string, out: NewPostRow[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collect(full, name, out);
    } else if (name.endsWith('.md')) {
      const { data, content } = matter(readFileSync(full, 'utf-8'));
      out.push({
        slug: name.replace(/\.md$/, ''),
        title: data.title ?? name,
        description: data.description ?? '',
        body: content.trim(),
        category,
        cover: data.cover ?? null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        draft: data.draft ?? false,
        pubDate: data.pubDate ? new Date(data.pubDate) : new Date(),
        updatedDate: data.updatedDate ? new Date(data.updatedDate) : null,
      });
    }
  }
}

async function main() {
  const rows: NewPostRow[] = [];
  collect(SEED_DIR, '未分类', rows);

  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  for (const row of rows) {
    await db
      .insert(posts)
      .values(row)
      .onConflictDoUpdate({ target: posts.slug, set: row });
    console.log(`  ✓ ${row.category} / ${row.slug}`);
  }

  console.log(`\n已写入 ${rows.length} 篇文章。`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
