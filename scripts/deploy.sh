#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
worktree_dir="/tmp/lucid-gh-pages"
commit_message="${*:-Deploy website}"

cd "$project_dir"
git push origin master
npm run build >/dev/null
cp dist/index.html dist/404.html
touch dist/.nojekyll
rm -rf "$worktree_dir"
git worktree add "$worktree_dir" origin/gh-pages >/dev/null
find "$worktree_dir" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a dist/. "$worktree_dir/"
cd "$worktree_dir"
git add -A
git diff --cached --quiet || git commit -m "$commit_message"
git push origin HEAD:gh-pages >/dev/null
cd "$project_dir"
git worktree remove "$worktree_dir"
