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
pnpm_store="$runtime/node_modules/.pnpm"
pnpm_flat="$pnpm_store/node_modules"
traced_package="$pnpm_store/next@16.2.11_react-dom@19.2.8_react@19.2.8__react@19.2.8"
traced_next="$traced_package/node_modules/next"
app_next="$runtime/apps/web/node_modules/next"

[[ -d "$traced_next" ]]
[[ -L "$app_next" ]]
[[ -L "$pnpm_flat/next" ]]

cp -a "$traced_next" "$runtime/node_modules/next"
shopt -s nullglob
for entry in "$pnpm_flat"/*; do
  name="$(basename "$entry")"
  [[ "$name" == "next" ]] && continue
  if [[ -d "$entry" && ! -L "$entry" ]]; then
    mkdir -p "$runtime/node_modules/$name"
    for scoped_entry in "$entry"/*; do
      cp -aL "$scoped_entry" "$runtime/node_modules/$name/$(basename "$scoped_entry")"
    done
  else
    cp -aL "$entry" "$runtime/node_modules/$name"
  fi
done

rm -rf "$runtime/apps/web/node_modules"
rm -rf "$pnpm_flat"
rm -rf "$traced_package"