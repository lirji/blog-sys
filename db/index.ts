import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Astro SSR 用 import.meta.env；seed/drizzle-kit 等 node 脚本用 process.env
const connectionString =
  (import.meta as any)?.env?.DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL 未设置，请检查 .env');
}

// 复用连接，避免 SSR 热重载时反复建连接
const globalForDb = globalThis as unknown as { _pg?: ReturnType<typeof postgres> };
const client = globalForDb._pg ?? postgres(connectionString);
if (import.meta.env?.DEV) globalForDb._pg = client;

export const db = drizzle(client, { schema });
export { schema };
