// @ts-nocheck -- fixture simulates an external app; its deps aren't installed
// and api_routes only ever regex-scans this text, never compiles it.
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ id: params.id });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ deleted: params.id });
}
