// @ts-nocheck -- fixture simulates an external app; its deps aren't installed.
// db_schema usage mode only needs a syntactically valid AST (unaffected by
// @ts-nocheck, which is a checker-only pragma), never a resolved Program.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Clean call: NOT inside a loop. */
export async function listUsers() {
  return prisma.user.findMany();
}

/** Planted N+1: a read call inside a for...of loop (query-in-loop). */
export async function postsForEachUser(users: { id: string }[]) {
  const results = [];
  for (const user of users) {
    const posts = await prisma.post.findMany({ where: { authorId: user.id } });
    results.push(posts);
  }
  return results;
}

/** Planted N+1: a read call inside a forEach callback (loop-keyword form). */
export function logPostTitles(users: { id: string }[]) {
  users.forEach(async (user) => {
    const post = await prisma.post.findUnique({ where: { id: user.id } });
    console.log(post?.title);
  });
}

/** Clean call: a write, not in a loop. */
export async function createUser(email: string) {
  return prisma.user.create({ data: { email } });
}
