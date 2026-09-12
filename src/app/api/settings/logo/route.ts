import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { PATHS } from '@/server/paths';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';

/**
 * GET /api/settings/logo
 * Check if the branding logo exists.
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const logoFile = path.join(PATHS.assets, 'logo.png');
    let exists = false;
    try {
      await fs.access(logoFile);
      exists = true;
    } catch {
      exists = false;
    }

    return apiSuccess({
      exists,
      url: '/api/settings/logo/file',
      logoPath: 'media/assets/logo.png',
    });
  }, req);
}

/**
 * POST /api/settings/logo
 * Upload and save brand logo image to media/assets/logo.png.
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Format request multipart tidak valid');
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Berkas logo (file) harus disertakan');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.mkdir(PATHS.assets, { recursive: true });
    const destination = path.join(PATHS.assets, 'logo.png');
    await fs.writeFile(destination, buffer);

    return apiSuccess({
      logoPath: 'media/assets/logo.png',
    });
  }, req);
}
