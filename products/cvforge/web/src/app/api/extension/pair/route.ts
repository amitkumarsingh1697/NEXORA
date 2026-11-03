import { NextResponse, type NextRequest } from 'next/server';
import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { clientIp, errorResponse, jsonBody } from '@/server/http';

// Called by the extension. Uses no cookies, so cross-origin CSRF does not apply.
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(
      await extensionService.pairDevice(ctx(), await jsonBody(req), { ip: clientIp(req) }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
