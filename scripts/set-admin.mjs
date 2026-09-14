import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const requestedRole = process.argv[3] ?? "admin";
const allowedRoles = new Set(["admin", "moderator", "member"]);

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/set-admin.mjs <email> [admin|moderator|member]");
  process.exit(1);
}
if (!allowedRoles.has(requestedRole)) {
  console.error(`Unknown role "${requestedRole}". Use admin, moderator or member.`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: list, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) {
  console.error(`Could not list users: ${listError.message}`);
  process.exit(1);
}

const user = list.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No account found for ${email}. Create it in the Supabase dashboard first.`);
  process.exit(1);
}

const appMetadata = { ...(user.app_metadata ?? {}) };
if (requestedRole === "member") delete appMetadata.role;
else appMetadata.role = requestedRole;

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: appMetadata });
if (updateError) {
  console.error(`Could not update ${email}: ${updateError.message}`);
  process.exit(1);
}

console.log(`${email} is now ${requestedRole}. They must sign in again for the new claim to apply.`);
