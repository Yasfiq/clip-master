import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';

/**
 * GET /api/config
 * List all pipeline configurations
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const configs = await db.pipelineConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return apiSuccess(configs);
  }, req);
}

/**
 * POST /api/config
 * Create a new configuration or update default config
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const body = await req.json();
    const { name, description, isDefault, ...configValues } = body;

    if (!name) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Config name is required');
    }

    // Hand-written validation for config constraints
    if (configValues.adScoreThreshold !== undefined) {
      const val = parseFloat(configValues.adScoreThreshold);
      if (isNaN(val) || val < 0.0 || val > 1.0) {
        return apiError(
          ErrorCode.VALIDATION_FAILED,
          'adScoreThreshold must be between 0.0 and 1.0',
        );
      }
    }

    try {
      // If setting this config as default, clear other default flag
      if (isDefault) {
        await db.pipelineConfig.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const config = await db.pipelineConfig.upsert({
        where: { name },
        update: {
          description,
          isDefault: !!isDefault,
          ...configValues,
        },
        create: {
          name,
          description,
          isDefault: !!isDefault,
          ...configValues,
        },
      });

      return apiSuccess(config, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}
