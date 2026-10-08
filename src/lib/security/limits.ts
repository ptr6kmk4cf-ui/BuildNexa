import { createRateLimiter } from "@/lib/security/rate-limit";

const TEN_MINUTES = 10 * 60 * 1000;

export const githubConnectLimiter = createRateLimiter(20, TEN_MINUTES);
export const planLimiter = createRateLimiter(8, TEN_MINUTES);
export const executeLimiter = createRateLimiter(6, TEN_MINUTES);
export const routeLimiter = createRateLimiter(12, TEN_MINUTES);
export const cancelLimiter = createRateLimiter(30, TEN_MINUTES);
