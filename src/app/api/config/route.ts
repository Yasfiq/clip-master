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
    const body = (await req.json().catch(() => ({}))) || {};
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
      const updateData: Record<string, unknown> = {};
      if (description !== undefined) updateData.description = description;
      if (isDefault !== undefined) updateData.isDefault = !!isDefault;
      for (const [k, v] of Object.entries(configValues)) updateData[k] = v;

      if (isDefault) {
        await db.pipelineConfig.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      // Prisma rejects an empty update object, so a name-only body must be
      // rejected as a validation failure instead of surfacing as a 500.
      if (Object.keys(updateData).length === 0) {
        return apiError(ErrorCode.VALIDATION_FAILED, 'No writable config values provided');
      }

      const config = await db.pipelineConfig.upsert({
        where: { name },
        update: updateData,
        create: {
          name,
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

/**
 * PUT /api/config — alias for POST; same upsert behaviour.
 * Aligns with AGENTS.md REST contract while preserving existing POST callers.
 */
export const PUT = POST;
