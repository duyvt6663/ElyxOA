/**
 * DECISION RECAP — 013 LLM Provider Config
 * - Provider LOCKED to OpenAI (per user direction; deterministic V1 rejected).
 * - Default model: `gpt-5.3-chat-latest`. The `*-chat-latest` suffix follows OpenAI's
 *   "always-current chat snapshot" pattern; the precise major.minor point release
 *   drifts as OpenAI rolls updates. The recorded id is the user's stated preference.
 *   VERIFY-AT-IMPL-TIME per 013 Open Question §1: run
 *     curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
 *       | jq '.data[].id' | grep chat-latest
 *   and adopt whichever id is live. If the live id differs (e.g. `gpt-5.2-chat-latest`),
 *   substitute the constant below AND note the substitution back into the plan.
 * - Provider is swappable via a single `@ai-sdk/<provider>` import; we never bind to
 *   provider-specific request shapes outside `src/lib/llm/*`.
 * - `OPENAI_API_KEY` is server-side only. `hasApiKey()` is the one gate the route
 *   handler uses to choose between 503 (graceful degraded mode) and real streaming.
 * - `MAX_HISTORY_TURNS` caps the messages array client→server so a long session can
 *   never blow the context window or cost ceiling.
 * - `RATE_LIMIT_PER_HOUR` is enforced per-IP in-memory; resets on cold start.
 */

export const LLM_PROVIDER = 'openai' as const;
export const LLM_MODEL = 'gpt-5.3-chat-latest' as const;
/** Max turns of conversation history sent in the grounding payload. */
export const MAX_HISTORY_TURNS = 8;
/** Per-IP rate limit (calls per hour). */
export const RATE_LIMIT_PER_HOUR = 20;

/** Optional override via env (server-side only). */
export function getModelId(): string {
  return process.env.LLM_MODEL ?? LLM_MODEL;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
