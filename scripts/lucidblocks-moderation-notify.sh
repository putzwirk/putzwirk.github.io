#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"
: "${MODERATION_URL:=https://putzwirk.github.io/lucidblocks/admin/submissions}"

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/lucidblocks"
state_file="$state_dir/notified-moderation-ids"
mkdir -p "$state_dir"
touch "$state_file"

while true; do
  response=$(curl --silent --fail --get "$SUPABASE_URL/rest/v1/issues" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --data-urlencode "select=id,title,type,author_name" \
    --data-urlencode "moderation_status=eq.pending" \
    --data-urlencode "order=created_at.desc")

  while IFS=$'\t' read -r id title type author; do
    [ -n "$id" ] || continue
    grep -Fqx "$id" "$state_file" && continue
    printf '%s\n' "$id" >> "$state_file"
    action=$(notify-send --urgency=critical --expire-time=0 --hint=int:transient:0 --app-name="Lucid Blocks" "New $type awaiting moderation" "$author posted: $title" \
      --action="default=Review in admin" \
      --wait 2>/dev/null || true)
    if [ "$action" = "default" ]; then
      xdg-open "$MODERATION_URL" >/dev/null 2>&1 || true
    fi
  done < <(printf '%s' "$response" | jq -r '.[] | [.id, .title, .type, .author_name] | @tsv')

  sleep "${MODERATION_INTERVAL:-60}"
done
