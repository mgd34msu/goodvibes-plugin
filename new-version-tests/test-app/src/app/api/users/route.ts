import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = url.searchParams.get('role');

  let query = 'SELECT * FROM users';
  if (role) {
    query += ` WHERE role = '${role}'`;
  }

  const users = await db.query(query);
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, role } = body;

  const result = await db.query(
    `INSERT INTO users (name, email, role) VALUES ('${name}', '${email}', '${role}')`
  );

  return NextResponse.json({ id: result.insertId, ...body }, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  await db.query(`DELETE FROM users WHERE id = ${id}`);
  return NextResponse.json({ success: true });
}
