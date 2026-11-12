#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"

rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
cp "$project_root/worker/index.js" "$dist_root/server/index.js"
cp "$project_root/worker/meta-ad-plan.mjs" "$project_root/worker/meta-ad-launcher.mjs" "$project_root/worker/meta-ad-store.mjs" "$dist_root/server/"
cp "$project_root/worker/price-experiment.mjs" "$project_root/worker/price-test-page.mjs" "$dist_root/server/"
cp "$project_root/worker/english.mjs" "$dist_root/server/"
cp "$project_root/worker/paypal-sandbox.mjs" "$dist_root/server/"
cp "$project_root/worker/paypal-founder.mjs" "$dist_root/server/"
printf '{"type":"module"}\n' > "$dist_root/server/package.json"
cp "$project_root/.openai/hosting.json" "$dist_root/.openai/hosting.json"
if [[ -d "$project_root/drizzle" ]]; then
  cp -R "$project_root/drizzle" "$dist_root/.openai/drizzle"
fi

echo "Built $dist_root"
