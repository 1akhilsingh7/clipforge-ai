import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Uses Upstash specifically because Vercel serverless functions don't
// share memory between invocations — an in-process Map-based limiter
// would reset (or diverge) on every cold start / different instance,
// silently doing nothing under real traffic.
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// 10 cost-bearing AI requests per minute per user is generous for a
// real user, tight enough to blunt a compromised-account cost attack.
const aiGenerationLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m") })
  : null;

export async function checkAiRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  if (!aiGenerationLimiter) {
    // No Upstash configured (e.g. local dev without it set up) — fail
    // open rather than blocking all AI features in dev, but this means
    // rate limiting is NOT ACTIVE until UPSTASH_* env vars are set.
    return { allowed: true };
  }

  const { success, reset } = await aiGenerationLimiter.limit(userId);
  if (!success) {
    return { allowed: false, retryAfterSeconds: Math.ceil((reset - Date.now()) / 1000) };
  }
  return { allowed: true };
}
