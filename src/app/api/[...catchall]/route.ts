import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'JOB_NOT_FOUND',
        message: 'API endpoint not found',
      },
    },
    { status: 404 },
  );
}

export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;
