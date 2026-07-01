import { pinyin } from 'pinyin-pro';

/** 图片扩展名 → MIME */
export const IMG_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export function cleanSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 非字母数字（含中文、空格、标点）→ 连字符
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

/** 中文标题 → 拼音 → 英文 slug（英文/数字原样保留） */
export function toSlug(title: string): string {
  const py = pinyin(title, { toneType: 'none', nonZh: 'consecutive' });
  return cleanSlug(py) || 'post';
}

/** 取正文首个 # 一级标题作为标题，并从正文移除该行 */
export function deriveTitle(body: string, fallback: string): { title: string; body: string } {
  const lines = body.split('\n');
  const idx = lines.findIndex((l) => /^#\s+\S/.test(l.trim()));
  if (idx !== -1 && idx < 5) {
    const title = lines[idx].trim().replace(/^#\s+/, '').trim();
    lines.splice(idx, 1);
    return { title, body: lines.join('\n').trim() };
  }
  return { title: fallback, body };
}

/** 从正文开头生成摘要 */
export function makeDescription(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 120);
}

export interface ImageRef {
  match: string;
  src: string;
}

/** 收集正文中的图片引用（markdown ![]() 与 html <img>） */
export function findImageRefs(body: string): ImageRef[] {
  const refs: ImageRef[] = [];
  const mdImg = /!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(body))) {
    let src = m[1];
    if (src.startsWith('<') && src.endsWith('>')) src = src.slice(1, -1);
    refs.push({ match: m[0], src });
  }
  const htmlImg = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = htmlImg.exec(body))) refs.push({ match: m[0], src: m[1] });
  return refs;
}

/** 把某个图片引用里的 src 替换为新 url */
export function replaceRef(body: string, ref: ImageRef, url: string): string {
  const replaced = ref.match.split(ref.src).join(url);
  return body.split(ref.match).join(replaced);
}
