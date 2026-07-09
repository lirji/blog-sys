import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { posts } from './schema';

/**
 * 摘要回填脚本
 * ------------------------------------------------------------------
 * 背景：不少文章的 description 为空、或直接等于标题、或和标题几乎重复，
 * 导致列表卡片和详情页副标题都是「废话」。本脚本从正文自动生成一句话摘要。
 *
 * 用法：
 *   npx tsx db/backfill-descriptions.ts            # 预演（dry-run，只打印不写库）
 *   npx tsx db/backfill-descriptions.ts --apply    # 实际写库
 *   npx tsx db/backfill-descriptions.ts --apply --all   # 连「已有像样摘要」的也一并重算
 *
 * 只在「摘要缺失 / 等于标题 / 与标题高度重复」时才覆盖；已有真正摘要的默认保留。
 */

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const MAX_LEN = 120; // 摘要最长字符数

/** 规范化：去首尾空格、折叠空白、去掉中英文之间的空格差异、小写，用于「摘要 == 标题」判断 */
function norm(s: string): string {
  return s
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 从 Markdown 正文抽取一句话摘要：
 * - 去掉 front-matter、代码块、图片、HTML 标签
 * - 跳过标题行（# ...）、引用/列表/表格/分隔线等结构行
 * - 取第一段正文散文，按句子边界截断到 MAX_LEN
 */
function makeDescription(body: string): string {
  let text = body ?? '';

  // 去 front-matter
  text = text.replace(/^\s*---\n[\s\S]*?\n---\s*/, '');
  // 去围栏代码块
  text = text.replace(/```[\s\S]*?```/g, '\n');
  // 去 HTML 注释与常见块级标签
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  const paras: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      paras.push(buf.join(' ').trim());
      buf = [];
    }
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim(); // 同时去掉 CRLF 的 \r
    if (!line) {
      flush();
      continue;
    }
    // 先剥掉行首可能残留的强调/引用/杂符（如 `_# 标题`、`> ` 前缀），再判断结构
    const probe = line.replace(/^[_*~>\s]+/, '');
    if (!probe) {
      flush();
      continue;
    }
    // 跳过结构性行：标题、分隔线、表格、图片、纯 HTML 标签行
    if (/^#{1,6}\s/.test(probe)) {
      flush();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(probe)) continue; // 分隔线
    if (/^\|.*\|$/.test(probe)) continue; // 表格
    if (/^!\[/.test(probe)) continue; // 独立图片
    if (/^<\/?[a-z][\s\S]*>$/i.test(probe)) continue; // 纯 HTML 标签行

    // 去掉行内 markdown 修饰
    const cleaned = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接 → 文字
      .replace(/`([^`]*)`/g, '$1') // 行内代码
      .replace(/^[>\s]*/, '') // 引用前缀
      .replace(/^[_*~\s]+/, '') // 行首残留的强调符/杂符
      .replace(/^#{1,6}\s+/, '') // 兜底：行首若仍是标题标记则去掉
      .replace(/^[-*+]\s+/, '') // 无序列表
      .replace(/^\d+\.\s+/, '') // 有序列表
      .replace(/[*_~]{1,3}/g, '') // 粗体/斜体/删除线
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned) buf.push(cleaned);
  }
  flush();

  const first = paras.find((p) => p.length > 0) ?? '';
  return truncate(first, MAX_LEN);
}

/** 按句子/标点边界优雅截断 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  // 优先在句末标点处收尾
  const sentenceEnd = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('.'),
    slice.lastIndexOf('!'),
    slice.lastIndexOf('?')
  );
  if (sentenceEnd >= max * 0.5) return slice.slice(0, sentenceEnd + 1);
  // 其次在次级标点处收尾
  const softEnd = Math.max(
    slice.lastIndexOf('，'),
    slice.lastIndexOf('；'),
    slice.lastIndexOf('、'),
    slice.lastIndexOf(',')
  );
  if (softEnd >= max * 0.6) return slice.slice(0, softEnd) + '…';
  return slice.trim() + '…';
}

/** 是否需要覆盖这篇的摘要 */
function shouldReplace(title: string, description: string): { replace: boolean; reason: string } {
  const d = description.trim();
  if (!d) return { replace: true, reason: '空' };
  if (norm(d) === norm(title)) return { replace: true, reason: '等于标题' };
  // 标题包含摘要、或摘要包含标题，且长度接近 → 视为重复
  const nd = norm(d);
  const nt = norm(title);
  if ((nt.includes(nd) || nd.includes(nt)) && Math.abs(nd.length - nt.length) <= 4) {
    return { replace: true, reason: '与标题高度重复' };
  }
  if (ALL) return { replace: true, reason: '--all 强制重算' };
  return { replace: false, reason: '已有摘要,保留' };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL 未设置,请检查 .env');
  const client = postgres(connectionString);
  const db = drizzle(client, { schema: { posts } });

  const rows = await db
    .select({ id: posts.id, slug: posts.slug, title: posts.title, description: posts.description, body: posts.body })
    .from(posts);

  console.log(`\n共 ${rows.length} 篇文章。模式:${APPLY ? '写库(--apply)' : '预演(dry-run)'}${ALL ? ' + 全量重算(--all)' : ''}\n`);

  let changed = 0;
  let skipped = 0;
  let empty = 0;

  for (const r of rows) {
    const { replace, reason } = shouldReplace(r.title, r.description ?? '');
    if (!replace) {
      skipped++;
      continue;
    }
    const next = makeDescription(r.body ?? '');
    if (!next) {
      // 正文里抽不出可读文字(比如全是代码/图片)——不动,避免写空
      empty++;
      console.log(`  ⚠ 跳过 [${r.slug}] 正文无可用文本,保持原样(原因:${reason})`);
      continue;
    }
    changed++;
    console.log(`  ✎ [${r.slug}] (${reason})`);
    console.log(`      旧: ${JSON.stringify(r.description ?? '')}`);
    console.log(`      新: ${JSON.stringify(next)}\n`);

    if (APPLY) {
      await db.update(posts).set({ description: next }).where(eq(posts.id, r.id));
    }
  }

  console.log(
    `\n汇总:待更新 ${changed} 篇 · 保留 ${skipped} 篇 · 无可用文本 ${empty} 篇。` +
      (APPLY ? ' 已写入数据库。' : ' 这是预演,加 --apply 才会写库。')
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
