import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { ctx } from '@/server/context';

export async function GET() {
  try {
    await ctx().db.execute(sql`select 1`);
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    // Config errors name the offending variables only, never their values.
    console.error('[health] check failed:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ status: 'degraded', database: 'unreachable' }, { status: 503 });
  }
}
