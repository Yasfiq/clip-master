import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { validateConfigValues, CONFIG_KEYS, type ConfigValue } from './validate';

/**
 * GET /api/config
 * List all pipeline configurations (the default row is the active one).
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
 * Upsert a pipeline configuration by name. Body: { name, description?, ...values }
 * where ...values are the writable keys validated in ./validate. Unknown keys
 * are dropped, never forwarded into the pipeline config.
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const body = await req.json();
    const { name, description, isDefault, ...rest } = body;

    if (!name) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Config name is required');
    }

    // Keep only the writable keys, validate them, drop the rest.
    const configValues: Record<string, unknown> = {};
    for (const key of CONFIG_KEYS) {
      if (key in rest) configValues[key] = rest[key];
    }

    const problems = validateConfigValues(configValues as Record<string, ConfigValue>);
    if (problems.length > 0) {
      return apiError(ErrorCode.VALIDATION_FAILED, problems.join('; '));
    }

    try {
      if (isDefault) {
        await db.pipelineConfig.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const config = await db.pipelineConfig.upsert({
        where: { name },
        update: {
          ...(description !== undefined ? { description } : {}),
          ...(isDefault !== undefined ? { isDefault: !!isDefault } : {}),
          ...configValues,
        },
        create: {
          name,
          ...(description !== undefined ? { description } : {}),
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
