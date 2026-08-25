# Apple Shortcutの再生成

`SHOWROOM-PiP.cherri`は、Apple Shortcutをコードでレビューできるようにしたソースです。配布ファイルはAppleの`shortcuts` CLIで`anyone`モード署名したものだけを`public/`へ置きます。

現在の配布物は[Cherri](https://github.com/electrikmilk/cherri) commit `951c0bb3c34ef4e3d6cb2ce9a1bff35071c9a7a2`で生成しています。

```bash
go run /path/to/cherri SHOWROOM-PiP.cherri --skip-sign
shortcuts sign \
  --mode anyone \
  --input "SHOWROOM PiP_unsigned.shortcut" \
  --output ../public/SHOWROOM-PiP.shortcut
```

署名時、Appleは改ざん防止の検証用にShortcutのコピーを受信します。ソースまたはPlayer URLを変更した場合は、再生成、再署名、iPhone実機でのインポートと実行確認を行います。
