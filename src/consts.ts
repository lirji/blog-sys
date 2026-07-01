// 站点级常量 —— 想改站点名/描述/导航都在这里
export const SITE_TITLE = '李睿君的博客';
export const SITE_DESCRIPTION = '记录后端工程、系统设计与一些随笔。';
export const SITE_AUTHOR = '李睿君';

export const NAV_LINKS = [
  { label: '首页', href: '/' },
  { label: '文章', href: '/blog' },
  { label: '分类', href: '/categories' },
  { label: '标签', href: '/tags' },
  { label: '关于', href: '/about' },
] as const;

export const SOCIAL_LINKS = [
  { label: 'GitHub', href: 'https://github.com/' },
  { label: 'Email', href: 'mailto:liruijun4@gmail.com' },
] as const;
