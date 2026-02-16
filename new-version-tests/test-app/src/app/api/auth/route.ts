import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = 'super-secret-key-123';

export async function POST(request: Request) {
  const { email, password } = await request.json();

  const users: any = await db.query(
    `SELECT * FROM users WHERE email = '${email}'`
  );

  if (users.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const user = users[0];
  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return NextResponse.json({ error: 'Invalid' }, { status: 401 });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
  return NextResponse.json({ token });
}
