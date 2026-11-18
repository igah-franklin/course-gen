import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import { estimateCost } from "./pricing";

/* -----------------------------------------------------------------------------
 * Modular AI provider interface. The pipeline only depends on `AiProvider`, so
 * another vendor can be added by implementing this interface and registering
 * it in `getAiProvider()`.
 * ---------------------------------------------------------------------------*/

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string };

export type StructuredRequest<S extends z.ZodType> = {
  operation: string; // e.g. "analyze_chunk", "generate_lesson"
  system: string;
  content: ContentPart[];
  schema: S;
  maxTokens?: number;
  effort?: Effort;
  context?: { userId?: string | null; jobId?: string | null; courseId?: string | null };
};

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; model: string };

export interface AiProvider {
  name: string;
  generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<{ data: z.infer<S>; usage: Usage }>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI provider is not configured. Set ANTHROPIC_API_KEY.");
  }
}
export class AiOutputError extends Error {}
export class AiRateLimitError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds = 30,
  ) {
    super(message);
  }
}

/* ------------------------------ Anthropic --------------------------------- */

class AnthropicProvider implements AiProvider {
  name = "anthropic";
  private client: Anthropic;
  constructor(
    private model: string,
    private defaultEffort: Effort,
  ) {
    // SDK retries 408/409/429/5xx with backoff (maxRetries); we add job-level retries on top.
    this.client = new Anthropic({ apiKey: serverEnv.anthropicApiKey, maxRetries: 4, timeout: 10 * 60 * 1000 });
  }

  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>) {
    const content: Anthropic.Beta.BetaContentBlockParam[] = req.content.map((part) =>
      part.type === "text"
        ? { type: "text", text: part.text }
        : { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.base64 } },
    );

    let message: Anthropic.Beta.BetaMessage;
    try {
      // Streaming avoids HTTP timeouts on long lesson generations.
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: req.maxTokens ?? 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // re-run on a fallback model if a safety classifier declines
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: {
          effort: req.effort ?? this.defaultEffort,
          format: zodOutputFormat(req.schema),
        },
      });
      message = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        const retryAfter = Number(err.headers?.get?.("retry-after") ?? 30);
        throw new AiRateLimitError("AI rate limit reached", Number.isFinite(retryAfter) ? retryAfter : 30);
      }
      if (err instanceof Anthropic.AuthenticationError) throw new AiNotConfiguredError();
      throw err;
    }

    const usage: Usage = {
      model: message.model ?? this.model,
      input: message.usage.input_tokens ?? 0,
      output: message.usage.output_tokens ?? 0,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    };
    await recordUsage(this.name, req, usage);

    if (message.stop_reason === "refusal") {
      throw new AiOutputError("The AI model declined to process this content.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiOutputError("AI output was truncated (max_tokens). The task will be retried.");
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiOutputError("AI returned invalid JSON.");
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiOutputError(`AI output failed validation: ${parsed.error.message.slice(0, 500)}`);
    }
    return { data: parsed.data as z.infer<S>, usage };
  }
}

/* ------------------------------ usage log --------------------------------- */

async function recordUsage(provider: string, req: StructuredRequest<z.ZodType>, usage: Usage) {
  try {
    await createAdminClient()
      .from("ai_usage")
      .insert({
        provider,
        model: usage.model,
        operation: req.operation,
        user_id: req.context?.userId ?? null,
        job_id: req.context?.jobId ?? null,
        course_id: req.context?.courseId ?? null,
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_read_tokens: usage.cacheRead,
        cache_write_tokens: usage.cacheWrite,
        cost_usd: estimateCost(usage.model, usage),
      });
  } catch (e) {
    console.error("[ai] failed to record usage", e);
  }
}

/* ------------------------------ registry ---------------------------------- */

export function aiConfigured() {
  return Boolean(serverEnv.anthropicApiKey);
}

export async function getAiProvider(): Promise<AiProvider> {
  if (!aiConfigured()) throw new AiNotConfiguredError();
  const settings = await getSetting("ai");
  return new AnthropicProvider(settings.model, settings.effort);
}
