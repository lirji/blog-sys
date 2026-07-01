import type { APIRoute } from 'astro';
import { renderMarkdown } from '../../lib/markdown';

export const POST: APIRoute = async ({ request }) => {
  const { markdown } = await request.json().catch(() => ({ markdown: '' }));
  const { html } = renderMarkdown(String(markdown ?? ''));
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
