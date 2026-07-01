import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { posts, type PostRow, type NewPostRow } from '../../db/schema';

/** 页面统一使用的文章形状（.data.* 兼容原有模板） */
export interface Post {
  id: number;
  slug: string;
  body: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    updatedDate?: Date | null;
    tags: string[];
    cover?: string | null;
    category: string;
    draft: boolean;
  };
}

function mapRow(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    body: row.body,
    data: {
      title: row.title,
      description: row.description,
      pubDate: row.pubDate,
      updatedDate: row.updatedDate,
      tags: row.tags ?? [],
      cover: row.cover,
      category: row.category,
      draft: row.draft,
    },
  };
}

/** 已发布文章，按发布时间倒序 */
export async function getPublishedPosts(): Promise<Post[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.draft, false))
    .orderBy(desc(posts.pubDate));
  return rows.map(mapRow);
}

/** 全部文章（含草稿），后台用 */
export async function getAllPosts(): Promise<Post[]> {
  const rows = await db.select().from(posts).orderBy(desc(posts.pubDate));
  return rows.map(mapRow);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const [row] = await db.select().from(posts).where(eq(posts.slug, slug)).limit(1);
  return row ? mapRow(row) : null;
}

export async function getPostById(id: number): Promise<Post | null> {
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ? mapRow(row) : null;
}

export async function createPost(data: NewPostRow): Promise<Post> {
  const [row] = await db.insert(posts).values(data).returning();
  return mapRow(row);
}

export async function updatePost(id: number, data: Partial<NewPostRow>): Promise<void> {
  await db.update(posts).set(data).where(eq(posts.id, id));
}

export async function deletePost(id: number): Promise<void> {
  await db.delete(posts).where(eq(posts.id, id));
}

/** 解析后台表单 → 文章字段（校验必填项） */
export function parsePostForm(form: FormData): { values?: NewPostRow; error?: string } {
  const title = String(form.get('title') ?? '').trim();
  const slug = String(form.get('slug') ?? '')
    .trim()
    .replace(/\s+/g, '-');
  if (!title || !slug) return { error: '标题和 Slug 为必填项。' };

  return {
    values: {
      title,
      slug,
      description: String(form.get('description') ?? '').trim(),
      body: String(form.get('body') ?? ''),
      category: String(form.get('category') ?? '').trim() || '未分类',
      cover: String(form.get('cover') ?? '').trim() || null,
      tags: String(form.get('tags') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      draft: form.get('draft') === 'on',
      pubDate: form.get('pubDate') ? new Date(String(form.get('pubDate'))) : new Date(),
    },
  };
}

// ---- 视图辅助 ----
export function getCategory(post: Post): string {
  return post.data.category || '未分类';
}
export function getSlug(post: Post): string {
  return post.slug;
}
export function postHref(post: Post): string {
  return `/blog/${post.slug}/`;
}
export function groupByCategory(list: Post[]): [string, Post[]][] {
  const map = new Map<string, Post[]>();
  for (const post of list) {
    const cat = getCategory(post);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(post);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}
