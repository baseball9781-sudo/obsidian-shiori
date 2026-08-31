#!/bin/bash
# 合否判定はこのスクリプト。目視レビューではない（開発フロー.md）
set -euo pipefail
cd "$(dirname "$0")"

echo "== typecheck =="
npm run --silent typecheck

echo "== unit tests =="
npm run --silent test

echo "== build =="
npm run --silent build >/dev/null

echo "== bundle sanity =="
test -f main.js
# プラグイン必須ファイル
test -f manifest.json
test -f styles.css
# ファイル書き込みの原則（SPEC §10）: vault.modify / adapter.write を呼ぶのは
# commands.ts と bulk.ts のみ（コマンド・一括操作以外で書き換えない）
VIOLATIONS=$(grep -rln 'vault\.modify\|adapter\.write\|\.process(' src/ | grep -v 'src/commands.ts' | grep -v 'src/bulk.ts' || true)
if [ -n "$VIOLATIONS" ]; then
  echo "NG: 書き込みAPIが commands.ts / bulk.ts 以外にある:"
  echo "$VIOLATIONS"
  exit 1
fi

echo "== VERIFY OK =="
