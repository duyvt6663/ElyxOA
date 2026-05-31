/**
 * DECISION RECAP — 013 /api/chat Route Handler
 * - Next.js App Router POST handler. Streaming via Vercel AI SDK's `streamText`.
 * - Provider LOCKED to OpenAI default `gpt-5.3-chat-latest` (see lib/llm/config.ts).
 * - Runtime: `nodejs` (NOT `edge`) for AI SDK compatibility unless the impl pass
 *   explicitly migrates after verifying `@ai-sdk/openai` is edge-safe. Cold start is
 *   ~200-500ms on Vercel Node functions, which is acceptable for a take-home demo.
 * - Stateless: no DB, no per-user history. Client carries `messages` in the body.
 * - Graceful degradation: missing OPENAI_API_KEY → 503 with a JSON error the UI
 *   renders as a small "chat not configured" notice next to the composer. The rest
 *   of the app (calendar, tabs) keeps working.
 * - Rate-limit: in-memory per-IP via lib/llm/rate-limit.ts. 429 with `retry-after`
 *   header. Out-of-scope: durable rate-limiting, captcha.
 *
 * PSEUDO-ALGORITHM:
 *   1. Parse JSON body { messages, selection, result, traces, activities }.
 *   2. If !hasApiKey() → 503 'chat not configured'.
 *   3. Resolve IP from x-forwarded-for (first hop) or fall back to 'unknown'.
 *      checkRateLimit(ip) → if blocked, 429 with retry-after.
 *   4. buildGrounding({ selection, result, traces, activities }) — compact payload.
 *   5. streamText({ model: openai(getModelId()), system: SYSTEM_PROMPT + grounding,
 *      messages: body.messages }).
 *   6. Return stream.toTextStreamResponse().
 * - On provider error inside streamText: 502 with a short error message.
 */

import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import availabilityData from '@/data/availability.json';
import { hasApiKey, getModelId } from '@/lib/llm/config';
import { SYSTEM_PROMPT, buildGrounding, type ChatMessage } from '@/lib/llm/prompt';
import { checkRateLimit } from '@/lib/llm/rate-limit';
import type { AvailabilityBundle } from '@/lib/types';

// 015: the server holds the canonical availability fixture so it can slice the member's
// occupied blocks for the selected date into the grounding (the client never ships 1000+ blocks).
const availability = availabilityData as unknown as AvailabilityBundle;

export const runtime = 'nodejs'; // edge optional; keep nodejs for AI SDK compatibility unless impl chooses otherwise

interface ChatRequestBody {
  messages: ChatMessage[];
  selection: { selectedOccurrenceId: string | null; selectedDate: string | null };
  // Slim payload: client sends only what the server needs to build grounding.
  result: import('@/lib/types').ScheduleResult;
  traces: import('@/lib/types').AllocationTrace[];
  activities: import('@/lib/types').Activity[];
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!hasApiKey()) {
    return new Response(
      JSON.stringify({ error: 'chat not configured — OPENAI_API_KEY missing on server' }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'rate limit exceeded', retryAfterSeconds: rl.retryAfterSeconds }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(rl.retryAfterSeconds) } }
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const grounding = buildGrounding({
    selection: body.selection,
    result: body.result,
    traces: body.traces,
    activities: body.activities,
    availability,
  });

  try {
    const result = streamText({
      model: openai(getModelId()),
      system: SYSTEM_PROMPT + '\n\nGROUNDING:\n' + JSON.stringify(grounding, null, 2),
      messages: body.messages,
    });
    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'provider error: ' + message }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
