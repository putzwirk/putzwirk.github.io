import type { SupabaseClient } from "./client.ts";

export interface RateRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export async function consumeAll(service: SupabaseClient, subject: string, rules: RateRule[]): Promise<boolean> {
  for (const rule of rules) {
    const { data, error } = await service.rpc("consume_rate_limit", {
      p_subject: subject,
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) throw new Error(error.message);
    if (data !== true) return false;
  }
  return true;
}
