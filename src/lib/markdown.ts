import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { createHighlighter } from 'shiki';

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

const LANGS = [
  'javascript', 'typescript', 'java', 'sql', 'bash', 'shell', 'json', 'yaml',
  'html', 'css', 'xml', 'python', 'go', 'rust', 'markdown', 'diff',
];

// 单例高亮器：亮/暗双主题，与 global.css 的 .shiki 变量规则配合
const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark-dimmed'],
  langs: LANGS,
});

// 生成与 TOC 一致的锚点 slug（保留中文，去空格/标点）
function slugify(s: string): string {
  return encodeURIComponent(
    s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '')
  );
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(code, lang) {
    const loaded = highlighter.getLoadedLanguages();
    const useLang = lang && loaded.includes(lang) ? lang : 'text';
    return highlighter.codeToHtml(code, {
      lang: useLang,
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      defaultColor: false,
    });
  },
}).use(anchor, { slugify, tabIndex: false });

export function renderMarkdown(src: string): { html: string; headings: Heading[] } {
  const tokens = md.parse(src ?? '', {});
  const headings: Heading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      headings.push({
        depth: Number(t.tag.slice(1)),
        slug: t.attrGet('id') ?? '',
        text: tokens[i + 1]?.content ?? '',
      });
    }
  }
  const html = md.renderer.render(tokens, md.options, {});
  return { html, headings };
}
