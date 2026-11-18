# NOTICE / 権利関係について

## 非公式プロジェクトです
このプロジェクトは RAD Game Tools / Epic Games / Mojang / Microsoft のいずれとも関係がなく、承認も受けていません。
"Bink" は RAD Game Tools (Epic Games Tools) の商標です。"Minecraft" は Mojang Synergies AB の商標です。

## ゲームの音声データは含みません
このリポジトリにはゲームの音声・バンクファイルは一切含まれていません。
自分が正当に所有しているファイルだけを使ってください。取り出した音声の再配布は、各権利者の規約に従ってください。

## デコーダの出典について（重要）
`docs/js/binka.js` は、FFmpeg の Bink Audio デコーダ (`libavcodec/binkaudio.c`) の
アルゴリズムと挙動を参考に、JavaScript で書き直した実装です。
FFmpeg の出力と全サンプルを突き合わせて一致を確認しています（`test/verify.js`）。
FFmpeg は LGPL-2.1-or-later でライセンスされています。派生物とみなされるかどうかが気になる場合は、
`docs/js/binka.js` を LGPL-2.1-or-later に切り替えるか、法務の専門家に相談してください。
.msscmp の構造は、公開されている解析メモ（Team Lodestone の Documentation）と、実ファイルの観察から得ました。

## 開発
Claude (Anthropic) の支援を受けて作成されました。
