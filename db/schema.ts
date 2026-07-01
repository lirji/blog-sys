import { pgTable, serial, text, boolean, timestamp, jsonb, integer, index, customType } from 'drizzle-orm/pg-core';

// PostgreSQL bytea（二进制），用于存图片
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  body: text('body').notNull().default(''), // 正文（Markdown 文本）
  category: text('category').notNull().default('未分类'),
  cover: text('cover'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  draft: boolean('draft').notNull().default(false),
  views: integer('views').notNull().default(0),
  pubDate: timestamp('pub_date', { withTimezone: true }).notNull().defaultNow(),
  updatedDate: timestamp('updated_date', { withTimezone: true }),
});

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 浏览事件流水：每次「计数成功」的浏览写一行，支撑 PV/UV 与时间序列，也用于防抖判断
export const viewEvents = pgTable(
  'view_events',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('view_events_post_ip_time_idx').on(t.postId, t.ip, t.createdAt),
    index('view_events_time_idx').on(t.createdAt),
  ]
);

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type ImageRow = typeof images.$inferSelect;
