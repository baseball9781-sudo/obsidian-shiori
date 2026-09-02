#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
DEST="$HOME/Documents/MainVault/.obsidian/plugins/shiori"
./verify.sh >/dev/null
mkdir -p "$DEST"
cp manifest.json main.js styles.css "$DEST/"
echo "deployed to $DEST"
echo "Obsidian側: 設定 → コミュニティプラグイン → リロード/有効化"
