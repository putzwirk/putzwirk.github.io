#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
worktree_dir="/tmp/lucid-gh-pages-maintenance"
message="${*:-Put the site into maintenance}"

cd "$project_dir"
git fetch origin gh-pages --quiet
rm -rf "$worktree_dir"
git worktree add "$worktree_dir" origin/gh-pages >/dev/null
cp maintenance/index.html "$worktree_dir/index.html"
cp maintenance/index.html "$worktree_dir/404.html"
cd "$worktree_dir"
git add -A
git diff --cached --quiet || git commit -m "$message"
git push origin HEAD:gh-pages >/dev/null
cd "$project_dir"
git worktree remove "$worktree_dir"
echo "Maintenance page deployed to gh-pages."
