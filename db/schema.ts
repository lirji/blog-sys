import { pgTable, serial, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

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
  pubDate: timestamp('pub_date', { withTimezone: true }).notNull().defaultNow(),
  updatedDate: timestamp('updated_date', { withTimezone: true }),
});

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
