// @ts-nocheck -- fixture simulates an external app; its deps aren't installed
// and api_routes only ever regex-scans this text, never compiles it.
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  return NextResponse.json({ posts: [] });
}

export const POST = async (req: Request) => {
  return NextResponse.json({ created: true }, { status: 201 });
};
