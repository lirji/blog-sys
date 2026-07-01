import { defineMiddleware } from 'astro:middleware';

// 保护 /admin（登录页除外）
export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  const isAdmin = pathname.startsWith('/admin');
  const isLogin = pathname === '/admin/login';

  if (isAdmin && !isLogin) {
    const secret = import.meta.env.ADMIN_SECRET;
    const session = context.cookies.get('session')?.value;
    if (!secret || session !== secret) {
      return context.redirect('/admin/login');
    }
  }
  return next();
});
