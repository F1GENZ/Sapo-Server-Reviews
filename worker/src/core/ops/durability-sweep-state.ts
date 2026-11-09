import type { RedisService } from '../redis/redis.service';

export const DURABILITY_SWEEP_STATE_KEY = 'durability-sweep:last';
const DURABILITY_SWEEP_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

export type DurabilitySweepState = {
  at: number;
  skipped: string | null;
  errors: string[];
};

export const recordDurabilitySweep = async (
  redis: Pick<RedisService, 'set'>,
  state: DurabilitySweepState,
): Promise<void> => {
  await redis.set(DURABILITY_SWEEP_STATE_KEY, state, DURABILITY_SWEEP_STATE_TTL_SECONDS).catch(() => undefined);
};

export const readDurabilitySweep = async (
  redis: Pick<RedisService, 'get'>,
): Promise<DurabilitySweepState | null> =>
  redis.get<DurabilitySweepState>(DURABILITY_SWEEP_STATE_KEY).catch(() => null);
