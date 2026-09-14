import { supabase } from "./supabase";

export async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
    } catch {
      return context.statusText || "Request failed";
    }
  }
  if (error instanceof Error) return error.message;
  return "Request failed";
}

export async function invokeOrThrow<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await describeFunctionError(error));
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}
