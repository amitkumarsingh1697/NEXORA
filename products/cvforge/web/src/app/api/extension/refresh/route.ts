import { NextResponse, type NextRequest } from 'next/server';
import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { errorResponse, jsonBody } from '@/server/http';

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await extensionService.refreshDeviceToken(ctx(), await jsonBody(req)));
  } catch (e) {
    return errorResponse(e);
  }
}
