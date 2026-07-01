export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 转义 HTML，并把匹配 term 的部分包成 <mark> */
export function highlight(text: string, term: string): string {
  const escaped = escapeHtml(text);
  if (!term.trim()) return escaped;
  const re = new RegExp(escapeRegExp(escapeHtml(term)), 'gi');
  return escaped.replace(re, (m) => `<mark>${m}</mark>`);
}

/** 从正文截取包含关键词的片段（去掉基础 Markdown 语法）并高亮 */
export function snippet(body: string, term: string, radius = 60): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const idx = plain.toLowerCase().indexOf(term.toLowerCase());
  if (!term.trim() || idx === -1) {
    const head = plain.slice(0, radius * 2);
    return escapeHtml(head) + (plain.length > radius * 2 ? '…' : '');
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(plain.length, idx + term.length + radius);
  return (
    (start > 0 ? '…' : '') +
    highlight(plain.slice(start, end), term) +
    (end < plain.length ? '…' : '')
  );
}
