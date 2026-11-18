/** USD per million tokens (Anthropic first-party list prices). Update as pricing changes. */
export const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export const SUPPORTED_MODELS = Object.keys(MODEL_PRICING);

export function estimateCost(
  model: string,
  usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
) {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING["claude-opus-5-5"];
  return (
    (usage.input * p.input +
      usage.output * p.output +
      (usage.cacheRead ?? 0) * p.cacheRead +
      (usage.cacheWrite ?? 0) * p.cacheWrite) /
    1_000_000
  );
}
