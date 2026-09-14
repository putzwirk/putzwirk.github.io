import { createClient } from "npm:@supabase/supabase-js@2.116.0";

export interface ActorUser {
  id: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
  email?: string | null;
}

export interface StorageBucketApi {
  createSignedUploadUrl(path: string): Promise<{ data: { token: string; signedUrl: string; path: string } | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

export interface SupabaseClient {
  auth: {
    getUser(jwt: string): Promise<{ data: { user: ActorUser | null }; error: { message: string } | null }>;
  };
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: any; error: { message: string } | null }>;
  storage: {
    from(bucket: string): StorageBucketApi;
  };
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase environment for the function runtime");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as SupabaseClient;
}

export function publicObjectUrl(path: string): string {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  return `${url}/storage/v1/object/public/issue-attachments/${path}`;
}
