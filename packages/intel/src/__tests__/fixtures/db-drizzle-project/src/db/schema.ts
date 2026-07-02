// @ts-nocheck -- fixture simulates an external app; its deps aren't installed
// and db_schema only ever regex-scans this text, never compiles it.
import { pgTable, varchar, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: integer('id').primaryKey(),
    email: varchar('email').notNull().unique(),
    active: boolean('active').notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  }),
);

export const posts = pgTable('posts', {
  id: integer('id').primaryKey(),
  title: varchar('title').notNull(),
  authorId: integer('author_id').notNull().references(() => users.id),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
