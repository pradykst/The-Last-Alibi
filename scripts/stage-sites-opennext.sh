#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
dist="$repo/dist"
open_next="$repo/apps/web/.open-next"

[[ -f "$open_next/worker.js" ]]
if [[ -e "$dist" ]]; then
  resolved="$(realpath "$dist")"
  [[ "$resolved" == "$repo/dist" ]]
  rm -rf "$dist"
fi

mkdir -p "$dist/server"
cp -a "$open_next/." "$dist/server/"
mv "$dist/server/worker.js" "$dist/server/index.js"
rm -rf "$dist/server/assets"
cp -a "$open_next/assets" "$dist/client"

runtime="$dist/server/server-functions/default"
traced_next="$runtime/node_modules/.pnpm/next@16.2.11_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/next"
app_next="$runtime/apps/web/node_modules/next"
pnpm_next="$runtime/node_modules/.pnpm/node_modules/next"

[[ -d "$traced_next" ]]
[[ -L "$app_next" ]]
[[ -L "$pnpm_next" ]]
rm "$app_next" "$pnpm_next"
cp -a "$traced_next" "$app_next"
cp -a "$traced_next" "$pnpm_next"