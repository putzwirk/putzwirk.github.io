# Putzwirk.github.io

This repository contains the Vite/React website for the Lucid Blocks mod page.

## Instructions for coding agents

Before changing deployment or Supabase-related code, read this file and inspect `scripts/deploy.sh`, `.env.example`, and `src/lib/supabase.ts`.

Use the existing deployment script instead of inventing a separate GitHub Pages workflow. The production site is served from the `gh-pages` branch, while application source is maintained on `master`.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser code. Only `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY` may be embedded in the frontend bundle. Never rename the service-role key to a `VITE_` variable.

Do not commit `.env`, `.env.local`, or any other local environment file. `.gitignore` protects these files. `.env.example` contains variable names and safe placeholders only.

Do not delete or replace the Supabase environment values when building for production. A build without the two `VITE_SUPABASE_*` variables throws during module initialization and produces a blank page.

## Local development

Install dependencies if needed:

```bash
npm install
```

Create `.env` in the project root with the frontend values:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The moderation environment at `~/.config/lucidblocks/moderation.env` contains server-side values for moderation and publishing. It is not a replacement for the frontend `.env`, and its service-role key must remain private.

Start the development server:

```bash
npm run dev
```

After changing `.env`, restart Vite. Validate the application bundle with:

```bash
npm run build
```

## Deployment

Run the canonical deployment script from the project root:

```bash
./scripts/deploy.sh "Deploy website"
```

The script builds the site, creates the GitHub Pages fallback `404.html`, updates the `gh-pages` worktree, commits generated files, and pushes `gh-pages` to GitHub. It also pushes the current `master` branch first, so review and commit source changes before deploying.

The package `deploy` script is an older alternative. Prefer `scripts/deploy.sh` for normal website deployments.

## Publishing a mod

Publishing requires the private Supabase service-role environment. Load it only in the shell running the publish command:

```bash
set -a
source ~/.config/lucidblocks/moderation.env
set +a
npm run publish -- path/to/mod-v1.0.0+1.0.0.pck \
  --mod-id mod \
  --name "Mod" \
  --tagline "Short description" \
  --changelog "Published build."
```

Do not put the service-role key in frontend source, committed files, GitHub Pages assets, or client-side environment variables.

## Important paths

- `src/`: application source
- `src/lib/supabase.ts`: browser Supabase client configuration
- `scripts/deploy.sh`: canonical GitHub Pages deployment
- `scripts/publish-mod.mjs`: service-role mod publishing utility
- `public/`: static assets copied into the production build
- `.env.example`: required environment variable reference
- `gh-pages`: generated production branch
