import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  JOB_ALREADY_RUNNING = 'JOB_ALREADY_RUNNING',
  JOB_NOT_READY = 'JOB_NOT_READY',
  PURE_AD_REJECTED = 'PURE_AD_REJECTED',
  NO_QUALIFYING_SEGMENTS = 'NO_QUALIFYING_SEGMENTS',
  BINARY_NOT_FOUND = 'BINARY_NOT_FOUND',
  STAGE_FAILED = 'STAGE_FAILED',
  INTERNAL = 'INTERNAL',
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: any;
}

export function apiError(code: ErrorCode, message: string, details?: any): NextResponse {
  const status =
    code === ErrorCode.JOB_NOT_FOUND
      ? 404
      : code === ErrorCode.VALIDATION_FAILED
        ? 400
        : code === ErrorCode.JOB_ALREADY_RUNNING || code === ErrorCode.JOB_NOT_READY
          ? 409
          : 500;
  logger.error(`API Error [${code}]: ${message}`);
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  // Wrap payload in a uniform { success, data } envelope so clients can
  // branch on the envelope shape rather than per-endpoint contracts.
  return NextResponse.json({ success: true, data }, { status });
}

export async function catchApiErrors(
  handler: (req: NextRequest) => Promise<NextResponse>,
  req: NextRequest,
): Promise<NextResponse> {
  try {
    return await handler(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Unhandled API error: ${msg}`);
    return apiError(ErrorCode.INTERNAL, 'Internal server error', msg);
  }
}
