import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { PATHS } from '@/server/paths';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';

/**
 * GET /api/settings/logo/file
 * Stream the uploaded logo image (media/assets/logo.png).
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const logoFile = path.join(PATHS.assets, 'logo.png');
    try {
      const buffer = await fs.readFile(logoFile);
      const isJpg =
        buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const contentType = isJpg ? 'image/jpeg' : 'image/png';
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return apiError(ErrorCode.JOB_NOT_FOUND, 'Logo belum diunggah');
    }
  }, req);
}
