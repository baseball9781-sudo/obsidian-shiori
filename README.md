# Shiori 🔖

Track the reading state of your notes — **unread ○ / reading ◐ / read ●** — with a single bookmark (栞, *shiori*) in the Markdown body.

Built for vaults where notes are generated or appended by AI pipelines: you can tell **before opening a note** whether you have read it, and when an AI appends to a note you already finished, it automatically flips back to "reading".

## How it works

The single source of truth is a `🔖` (or `%%🔖%%`) in the note body:

- no `🔖` → **○ unread**
- content after `🔖` → **◐ reading**
- nothing after `🔖` → **● read**

Everything else is derived from that. Delete the plugin's cache and nothing is lost — the state lives in your Markdown.

## Features

- **File Explorer badges**: ○ / ◐ / ● in front of tracked notes (filenames are never modified)
- **Place bookmark anywhere**: right-click "ここに栞" in Reading View or the editor, or press `Cmd/Ctrl+Shift+B` to drop the bookmark after the last visible paragraph
- **"Read up to here" divider** in Reading View at the bookmark position
- **State chip** at the top of each tracked note — click ◐ to jump to your bookmark
- **`reading` code block**: embed a live list of unread / in-progress notes anywhere

  ~~~
  ```reading
  state: unread,reading
  group: true
  sort: mtime desc
  ```
  ~~~

- **Scoping**: include/exclude folders in settings, override per note with `reading-track: true|false` frontmatter
- **Bulk operations**: mark a whole folder read/unread (with a confirmation dialog)
- **AI-friendly**: appends after the bookmark automatically turn ● into ◐; the plugin never writes to your notes except when you explicitly use its commands

## Commands

| Command | Action |
|---|---|
| ここに栞 (Place bookmark here) | Editor: after cursor line. Reading View: after last visible paragraph. Recommended hotkey: `Cmd/Ctrl+Shift+B` (assign in Settings → Hotkeys) |
| 栞へ移動 (Jump to bookmark) | Scroll to the bookmark |
| 読了にする (Mark as read) | Move bookmark to end of file |
| 未読に戻す (Mark as unread) | Remove bookmarks |
| 対象外にする (Exclude) | Add `reading-track: false` to frontmatter |

## Install

Not yet in the community plugin directory. Until then:

- **BRAT**: add `baseball9781-sudo/obsidian-shiori` in the BRAT plugin
- **Manual**: copy `manifest.json`, `main.js`, `styles.css` into `<vault>/.obsidian/plugins/shiori/`

Works on desktop and mobile.

---

## 日本語

AIパイプラインが生成・追記するノートを、開かずに ○未読 / ◐途中 / ●既読 で見分けるためのプラグインです。状態の正は本文中の 🔖 だけ。途中でやめたらそこに栞、最後まで読んだら末尾に栞 — 普段やることはそれだけです。AIが既読ノートの末尾に追記すると自動で◐に戻ります。

詳しい仕様は [SPEC.md](SPEC.md)（日本語）を参照。

## License

MIT
