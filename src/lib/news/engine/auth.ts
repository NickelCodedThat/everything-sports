import { createHash, timingSafeEqual } from "node:crypto";

/** A shorter secret is treated as "not configured": refusing beats accepting a guessable credential. */
export const MIN_CRON_SECRET_LENGTH = 32;

export type BearerCheck = "ok" | "not-configured" | "unauthorized";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Checks `Authorization: Bearer <secret>` against NEWSROOM_CRON_SECRET.
 * Both sides are hashed first so the comparison is constant-time and independent of length.
 * If the secret is unset/too short the answer is "not-configured" — never "ok".
 */
export function checkBearerSecret(authorizationHeader: string | null, expectedSecret: string | undefined): BearerCheck {
  const expected = expectedSecret?.trim();
  if (!expected || expected.length < MIN_CRON_SECRET_LENGTH) return "not-configured";

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader?.trim() ?? "");
  if (!match) return "unauthorized";

  return timingSafeEqual(sha256(match[1]), sha256(expected)) ? "ok" : "unauthorized";
}
