# Lucid Blocks Mods

Fan site and community platform for [Lucid Blocks](https://store.steampowered.com/app/3495730/Lucid_Blocks/)
mods, built on QualiaMods. Static React/Vite frontend on GitHub Pages with Supabase for data,
auth, storage, Edge Functions and a moderated bug/idea tracker.

## Stack

- React 18 + TypeScript + Vite, React Router, single dark theme in `src/index.css`
- Supabase: Postgres + RLS, Auth (email + anonymous sessions), Storage, Edge Functions, Realtime
- No server runtime: privileged writes go through Supabase Row Level Security, `SECURITY DEFINER`
  RPCs, or Edge Functions

## Repository layout

```
src/                      React app (pages, components, lib)
supabase/migrations/      schema, RLS policies, triggers, functions, buckets, cron
supabase/functions/       Edge Functions (submit-issue, submit-comment, create-upload-url,
                          download, purge-attachments, notify) + shared helpers
supabase/seed.sql         deterministic fixtures for local/staging
scripts/rls-test/         PGlite harness that applies migrations and asserts the RLS matrix
scripts/publish-mod.mjs   CLI publisher (checksum, versioned storage path, tags)
scripts/deploy.sh         production deploy to the gh-pages branch
scripts/deploy-maintenance.sh   puts the live site into maintenance
e2e/                      Playwright specs (skip when E2E_BASE_URL/admin creds are unset)
IMPLEMENTATION_PLAN.md    working plan and progress log (source of truth)
```

## Local development

```bash
npm install
cp .env.example .env          # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Environment rules: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may reach the browser.
The service-role key stays server-side in `~/.config/lucidblocks/moderation.env` (or Supabase
secrets) and must never use a `VITE_` prefix.

## Database

Migrations are the source of truth and are applied in filename order.

```bash
supabase link --project-ref <ref>
supabase db push                 # apply migrations
supabase db reset                # local only: rebuild + seed
```

The RLS matrix is tested without Docker using PGlite:

```bash
npm run test:rls                 # applies every migration + seed, asserts role/action matrix
```

## Edge Functions

```bash
npm run check:functions          # deno check all functions
npm run test:functions           # deno unit tests
supabase functions deploy submit-issue submit-comment create-upload-url download purge-attachments notify
```

Secrets: `IP_HASH_PEPPER`, `PURGE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`.
See `IMPLEMENTATION_PLAN.md` section 10 for the dashboard setup (anonymous sign-ins, DB webhooks,
scheduled janitors).

## Publishing a mod

```bash
set -a; source ~/.config/lucidblocks/moderation.env; set +a
npm run publish -- path/to/Mod-v1.2.0+4.0.pck \
  --mod-id Mod --name "Mod" --tagline "Short description" \
  --changelog "Fixed X" --tags inventory,ui --channel stable
```

The publisher verifies the `GDPC` header, records a SHA-256 checksum, stores the file under
`mods/<modId>/<version>/`, and upserts the version row.

## Moderation

- `npm run set-admin -- you@example.com admin` grants the `app_metadata.role` claim.
- Staff sign in at `/lucidblocks/login`; the Admin console covers mods, versions, labels and the
  submissions queue (search, filters, bulk actions, reject-with-reason).
- Authors can edit or remove their own pending submissions; anonymous sessions are created on demand.

## Testing

```bash
npm run test:rls        # database / RLS matrix (PGlite)
npm run test:functions  # Edge Function units (Deno)
npm run check:functions # Edge Function typecheck
npx playwright test     # E2E (needs E2E_BASE_URL and E2E_ADMIN_EMAIL/PASSWORD)
npm run build           # tsc -b && vite build
```

CI runs the RLS suite, function units, function typecheck, Playwright discovery and the build.

## Deployment

```bash
./scripts/deploy.sh "Deploy website"        # source is master, output is gh-pages
./scripts/deploy-maintenance.sh             # temporary maintenance page for the live site
```

`gh-pages` is generated; never edit it by hand. The maintenance script replaces `index.html` and
`404.html`; `scripts/deploy.sh` restores the full app.
