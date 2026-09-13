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

    const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_LOGO_SIZE) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Ukuran berkas logo maksimal 5 MB');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify PNG or JPEG magic bytes
    const isPng =
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isJpg =
      buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    if (!isPng && !isJpg) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'Hanya format gambar PNG atau JPEG valid yang diperbolehkan',
      );
    }

    await fs.mkdir(PATHS.assets, { recursive: true });
    const destination = path.join(PATHS.assets, 'logo.png');
    await fs.writeFile(destination, buffer);

    return apiSuccess({
      logoPath: 'media/assets/logo.png',
    });
  }, req);
}
