import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const migrationsDir = path.join(repo, "supabase", "migrations");
const seedFile = path.join(repo, "supabase", "seed.sql");

const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select case
    when strpos(name, '/') = 0 then '{}'::text[]
    else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  end
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

create schema if not exists cron;
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$ select 1::bigint $$;
grant usage on schema cron to anon, authenticated, service_role;
`;

const CLAIMS = {
  anon: null,
  anonSession: { sub: "33333333-3333-3333-3333-333333333333", is_anonymous: true, app_metadata: {} },
  member: { sub: "22222222-2222-2222-2222-222222222222", is_anonymous: false, email: "member@example.com", app_metadata: {} },
  admin: { sub: "11111111-1111-1111-1111-111111111111", is_anonymous: false, email: "admin@example.com", app_metadata: { role: "admin" } },
};

const db = new PGlite();

async function applyAll() {
  await db.exec(STUBS);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      console.error(`Migration failed: ${file}`);
      throw error;
    }
  }
  const seed = await readFile(seedFile, "utf8");
  await db.exec(seed);
}

async function as(role, claimKey, sql, params = []) {
  const claims = CLAIMS[claimKey];
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims ? JSON.stringify(claims) : ""]);
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, affected: result.affectedRows ?? result.rows.length, error: null };
  } catch (error) {
    return { rows: [], affected: 0, error: error.message };
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [""]);
  }
}

const checks = [
  {
    name: "C2 fixed: anon sees only approved, non-deleted issues",
    run: () => as("anon", "anon", "select moderation_status from public.issues"),
    ok: (r) => !r.error && r.rows.length === 4 && r.rows.every((x) => x.moderation_status === "approved"),
  },
  {
    name: "C2 fixed: anon cannot read pending or rejected issues",
    run: () => as("anon", "anon", "select count(*)::int c from public.issues where moderation_status <> 'approved'"),
    ok: (r) => !r.error && Number(r.rows[0].c) === 0,
  },
  {
    name: "C3 fixed: anon can no longer delete a pending issue",
    run: () => as("anon", "anon", "delete from public.issues where id = 'bbbbbbbb-0000-0000-0000-000000000005'"),
    ok: (r) => !r.error && r.affected === 0,
  },
  {
    name: "H1 fixed: anonymous session edits its own pending issue",
    run: () => as("authenticated", "anonSession", "update public.issues set title = 'Edited pending' where id = 'bbbbbbbb-0000-0000-0000-000000000005'"),
    ok: (r) => !r.error && r.affected === 1,
  },
  {
    name: "H1 fixed: another member cannot edit that pending issue",
    run: () => as("authenticated", "member", "update public.issues set title = 'Hijacked' where id = 'bbbbbbbb-0000-0000-0000-000000000005'"),
    ok: (r) => !r.error && r.affected === 0,
  },
  {
    name: "C1 fixed: a normal member cannot delete mods",
    run: () => as("authenticated", "member", "delete from public.mods where id = 'ModA'"),
    ok: (r) => !r.error && r.affected === 0,
  },
  {
    name: "C1 fixed: staff can read the moderation queue",
    run: () => as("authenticated", "admin", "select count(*)::int c from public.issues where moderation_status = 'pending'"),
    ok: (r) => !r.error && Number(r.rows[0].c) === 1,
  },
  {
    name: "clients can no longer insert issues directly",
    run: () => as("authenticated", "anonSession", "insert into public.issues (title, type) values ('direct', 'bug')"),
    ok: (r) => Boolean(r.error),
  },
  {
    name: "D8: only approved attachments are visible to anon",
    run: () => as("anon", "anon", "select count(*)::int c from storage.objects where bucket_id = 'issue-attachments'"),
    ok: (r) => !r.error && Number(r.rows[0].c) === 1,
  },
  {
    name: "D8: an author can read their own pending attachment",
    run: () => as("authenticated", "anonSession", "select count(*)::int c from storage.objects where bucket_id = 'issue-attachments'"),
    ok: (r) => !r.error && Number(r.rows[0].c) === 2,
  },
  {
    name: "D8: anonymous requests cannot upload attachments",
    run: () => as("anon", "anon", "insert into storage.objects (bucket_id, name) values ('issue-attachments', 'x.png')"),
    ok: (r) => Boolean(r.error),
  },
  {
    name: "D8: direct client uploads are disabled (signed uploads only)",
    run: () => as("authenticated", "anonSession", "insert into storage.objects (bucket_id, name) values ('issue-attachments', 'issues/bbbbbbbb-0000-0000-0000-000000000005/33333333-3333-3333-3333-333333333333/y.png')"),
    ok: (r) => Boolean(r.error),
  },
  {
    name: "D8: the issue-attachments bucket is private",
    run: () => as("anon", "anon", "select public from storage.buckets where id = 'issue-attachments'"),
    ok: (r) => !r.error && r.rows[0]?.public === false,
  },
  {
    name: "H3 fixed: forgeable vote RPC removed",
    run: () => as("anon", "anon", "select public.increment_issue_votes('bbbbbbbb-0000-0000-0000-000000000003')"),
    ok: (r) => Boolean(r.error),
  },
  {
    name: "D9: toggle_vote adds then removes exactly one vote",
    run: async () => {
      const first = await as("authenticated", "anonSession", "select public.toggle_vote('bbbbbbbb-0000-0000-0000-000000000003') as c");
      const count = await as("anon", "anon", "select votes from public.issues where id = 'bbbbbbbb-0000-0000-0000-000000000003'");
      const second = await as("authenticated", "anonSession", "select public.toggle_vote('bbbbbbbb-0000-0000-0000-000000000003') as c");
      return { rows: [{ first: first.rows[0]?.c, count: count.rows[0]?.votes, second: second.rows[0]?.c }], affected: 0, error: first.error || count.error || second.error };
    },
    ok: (r) => !r.error && Number(r.rows[0].first) === 1 && Number(r.rows[0].count) === 1 && Number(r.rows[0].second) === 0,
  },
  {
    name: "D4: rate limiter blocks the 11th call in a 10-limit window",
    run: async () => {
      let last = true;
      for (let i = 0; i < 11; i += 1) {
        const r = await as("service_role", "anon", "select public.consume_rate_limit('tester', 'issue', 10, 3600) as ok");
        if (r.error) return r;
        last = r.rows[0].ok;
      }
      return { rows: [{ last }], affected: 0, error: null };
    },
    ok: (r) => !r.error && r.rows[0].last === false,
  },
  {
    name: "D11: one IP counts once per version",
    run: async () => {
      const version = "aaaaaaaa-0000-0000-0000-000000000001";
      const first = await as("service_role", "anon", `select public.register_download('${version}', 'ip-hash-1') as ok`);
      const second = await as("service_role", "anon", `select public.register_download('${version}', 'ip-hash-1') as ok`);
      const count = await as("anon", "anon", `select download_count from public.mod_versions where id = '${version}'`);
      return { rows: [{ first: first.rows[0]?.ok, second: second.rows[0]?.ok, count: count.rows[0]?.download_count }], affected: 0, error: first.error || second.error || count.error };
    },
    ok: (r) => !r.error && r.rows[0].first === true && r.rows[0].second === false && Number(r.rows[0].count) === 1,
  },
  {
    name: "anonymous (no session) cannot call toggle_vote",
    run: () => as("anon", "anon", "select public.toggle_vote('bbbbbbbb-0000-0000-0000-000000000003')"),
    ok: (r) => Boolean(r.error),
  },
];

let failures = 0;
try {
  await applyAll();
  console.log(`Applied ${(await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).length} migration(s) + seed\n`);
  for (const check of checks) {
    const result = await check.run();
    const passed = check.ok(result);
    if (!passed) failures += 1;
    console.log(`${passed ? "PASS" : "FAIL"}  ${check.name}${result.error ? ` (error: ${result.error})` : ""}`);
  }
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  await db.close();
}

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
