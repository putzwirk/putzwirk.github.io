import { serviceClient } from "../_shared/client.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { clientIp, hashIp } from "../_shared/ip.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const service = serviceClient();

  let body: { version_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const versionId = typeof body.version_id === "string" ? body.version_id : "";
  if (!UUID_PATTERN.test(versionId)) return fail("invalid version_id");

  const { data: version, error: versionError } = await service
    .from("mod_versions")
    .select("id, storage_path")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) return fail(versionError.message, 500);
  if (!version) return fail("Version not found", 404);

  const pepper = Deno.env.get("IP_HASH_PEPPER") ?? "lucidblocks-dev-pepper";
  const ipHash = await hashIp(clientIp(req), pepper);
  const { data: counted, error: countError } = await service.rpc("register_download", {
    p_version_id: versionId,
    p_ip_hash: ipHash,
  });
  if (countError) return fail(countError.message, 500);

  const { data: publicUrl } = service.storage.from("mod-files").getPublicUrl(version.storage_path);
  return json({ url: publicUrl.publicUrl, counted: counted === true });
});
