import { desc, asc, eq, gt, lt, and, or, ilike, count, countDistinct, sql } from 'drizzle-orm';
import { db } from '../../db';
import { posts, viewEvents, images, type PostRow, type NewPostRow } from '../../db/schema';

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
    views: number;
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
      views: row.views,
    },
  };
}

/** 同一 IP 对同一文章的计数去重窗口 */
const VIEW_WINDOW_MS = 30 * 60 * 1000; // 30 分钟

/**
 * 记录一次浏览：同一 IP 在窗口内重复访问不重复计数。
 * 返回当前浏览量。
 */
export async function recordView(postId: number, ip: string): Promise<number> {
  // 该 IP 对该文章最近一次计数事件
  const [recent] = await db
    .select({ createdAt: viewEvents.createdAt })
    .from(viewEvents)
    .where(and(eq(viewEvents.postId, postId), eq(viewEvents.ip, ip)))
    .orderBy(desc(viewEvents.createdAt))
    .limit(1);

  // 窗口内：不计数，返回当前值
  if (recent && Date.now() - recent.createdAt.getTime() < VIEW_WINDOW_MS) {
    const [p] = await db
      .select({ views: posts.views })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    return p?.views ?? 0;
  }

  // 计数 + 写入流水
  const [row] = await db
    .update(posts)
    .set({ views: sql`${posts.views} + 1` })
    .where(eq(posts.id, postId))
    .returning({ views: posts.views });
  await db.insert(viewEvents).values({ postId, ip });
  return row?.views ?? 0;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD（UTC）
  pv: number;
  uv: number;
}

/** 近 N 天每日 PV/UV（补齐无数据的日期为 0） */
export async function getViewTrend(days: number): Promise<DayPoint[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${viewEvents.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      pv: count(),
      uv: countDistinct(viewEvents.ip),
    })
    .from(viewEvents)
    .where(gt(viewEvents.createdAt, sql`now() - make_interval(days => ${days})`))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key);
    out.push({ date: key, pv: r ? Number(r.pv) : 0, uv: r ? Number(r.uv) : 0 });
  }
  return out;
}

/** 热门文章：按浏览量倒序（已发布） */
export async function getPopularPosts(limit = 5): Promise<Post[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.draft, false))
    .orderBy(desc(posts.views), desc(posts.pubDate))
    .limit(limit);
  return rows.map(mapRow);
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

/** 相邻文章：newer=更新的一篇，older=更早的一篇（仅已发布） */
export async function getAdjacentPosts(
  current: Post
): Promise<{ newer: Post | null; older: Post | null }> {
  const [newerRow] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.draft, false), gt(posts.pubDate, current.data.pubDate)))
    .orderBy(asc(posts.pubDate))
    .limit(1);
  const [olderRow] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.draft, false), lt(posts.pubDate, current.data.pubDate)))
    .orderBy(desc(posts.pubDate))
    .limit(1);
  return {
    newer: newerRow ? mapRow(newerRow) : null,
    older: olderRow ? mapRow(olderRow) : null,
  };
}

/** 全文搜索：标题/摘要/正文子串匹配（已发布） */
export async function searchPosts(q: string): Promise<Post[]> {
  const term = `%${q}%`;
  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.draft, false),
        or(ilike(posts.title, term), ilike(posts.description, term), ilike(posts.body, term))
      )
    )
    .orderBy(desc(posts.pubDate));
  return rows.map(mapRow);
}

/** 后台分页 + 可选分类筛选（含草稿） */
export async function getPostsPage(opts: {
  page: number;
  pageSize: number;
  category?: string;
}): Promise<{ items: Post[]; total: number; totalPages: number; page: number }> {
  const page = Math.max(1, opts.page || 1);
  const cond = opts.category ? eq(posts.category, opts.category) : undefined;

  const countQ = db.select({ value: count() }).from(posts);
  const [{ value: total }] = await (cond ? countQ.where(cond) : countQ);

  const listQ = db.select().from(posts);
  const rows = await (cond ? listQ.where(cond) : listQ)
    .orderBy(desc(posts.pubDate))
    .limit(opts.pageSize)
    .offset((page - 1) * opts.pageSize);

  const totalNum = Number(total);
  return {
    items: rows.map(mapRow),
    total: totalNum,
    totalPages: Math.max(1, Math.ceil(totalNum / opts.pageSize)),
    page,
  };
}

export interface DashboardStats {
  totalPosts: number;
  published: number;
  drafts: number;
  totalViews: number;
  uniqueVisitors: number;
  totalImages: number;
  categories: { category: string; count: number }[];
  topTags: { tag: string; count: number }[];
  topPosts: Post[];
  recentViewed: { title: string; slug: string; views: number; viewedAt: Date }[];
}

/** 后台看板聚合统计 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [{ total }] = await db.select({ total: count() }).from(posts);
  const [{ pub }] = await db
    .select({ pub: count() })
    .from(posts)
    .where(eq(posts.draft, false));
  const [{ viewsSum }] = await db
    .select({ viewsSum: sql<number>`coalesce(sum(${posts.views}), 0)` })
    .from(posts);
  const [{ visitors }] = await db
    .select({ visitors: countDistinct(viewEvents.ip) })
    .from(viewEvents);
  const [{ imgs }] = await db.select({ imgs: count() }).from(images);

  // 热门标签（从已发布文章的 tags 聚合）
  const published = await getPublishedPosts();
  const tagMap = new Map<string, number>();
  for (const p of published) for (const t of p.data.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
  const topTags = [...tagMap.entries()]
    .map(([tag, c]) => ({ tag, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // 最近被访问的文章（去重取最近 6 篇）
  const rows = await db
    .select({
      title: posts.title,
      slug: posts.slug,
      views: posts.views,
      viewedAt: viewEvents.createdAt,
    })
    .from(viewEvents)
    .innerJoin(posts, eq(viewEvents.postId, posts.id))
    .orderBy(desc(viewEvents.createdAt))
    .limit(40);
  const seen = new Set<string>();
  const recentViewed: DashboardStats['recentViewed'] = [];
  for (const r of rows) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    recentViewed.push({ ...r, views: Number(r.views) });
    if (recentViewed.length >= 6) break;
  }

  return {
    totalPosts: Number(total),
    published: Number(pub),
    drafts: Number(total) - Number(pub),
    totalViews: Number(viewsSum),
    uniqueVisitors: Number(visitors),
    totalImages: Number(imgs),
    categories: await getAllCategories(),
    topTags,
    topPosts: await getPopularPosts(5),
    recentViewed,
  };
}

/** 所有分类及其文章数（含草稿，后台筛选用） */
export async function getAllCategories(): Promise<{ category: string; count: number }[]> {
  const rows = await db
    .select({ category: posts.category, value: count() })
    .from(posts)
    .groupBy(posts.category);
  return rows
    .map((r) => ({ category: r.category, count: Number(r.value) }))
    .sort((a, b) => b.count - a.count);
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

/**
 * 估算中文阅读时长（分钟）。
 * 粗略统计正文「可读字符数」：剔除代码块 / 行内代码 / 图片，链接仅保留文字，
 * 去掉常见 Markdown 标记与空白后按每分钟约 400 字换算，最少 1 分钟。
 * 纯函数，不依赖也不改动其它逻辑。
 */
export function readingMinutes(body: string): number {
  const text = (body ?? '')
    .replace(/```[\s\S]*?```/g, '') // 围栏代码块
    .replace(/`[^`]*`/g, '') // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^[ \t]*[#>\-*+]+[ \t]*/gm, '') // 行首标题/引用/列表符号
    .replace(/[*_~`#>|]/g, ''); // 残余强调/表格标记
  const chars = text.replace(/\s+/g, '').length; // 不含空白的可读字符数
  return Math.max(1, Math.round(chars / 400));
}

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
