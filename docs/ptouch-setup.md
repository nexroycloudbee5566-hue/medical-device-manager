# P-touch（Brother）ラベル印刷のセットアップ

機器台帳の **ME No.**（`devices.barcode`）を CODE128 バーコードとして P-touch ラベルに印刷します。

## 前提

- **Windows PC**（病院のラベル印刷用 PC）
- Brother P-touch ラベルプリンター（QL シリーズなど b-PAC 対応機種）
- プリンタードライバー・**P-touch Editor**
- **b-PAC SDK**（32bit 版を推奨）
- ブラウザ **Chrome または Edge** + **Brother b-PAC Extension**

## 1. Brother ソフトのインストール

1. [b-PAC SDK ダウンロード](https://support.brother.com/g/s/es/dev/en/bpac/download/index.html) から SDK をインストール
2. 同ページまたは SDK 同梱の **b-PAC Extension** を Chrome / Edge に追加
3. P-touch Editor でラベルテンプレート（`.lbx`）を作成

## 2. テンプレート（.lbx）の作り方

1. P-touch Editor で新規ラベル（使用テープサイズに合わせる。例: 62mm×29mm）
2. **バーコード** オブジェクトを配置 → オブジェクト名を `Barcode` に（プロパティで名前を変更）
3. 必要なら **テキスト** を追加 → 名前を `txtName` に（機種名表示用）
4. 例: `C:\Labels\me-device.lbx` として保存

アプリの「P-touch 設定」で次を入力します。

| 項目 | 例 |
|------|-----|
| テンプレートパス | `C:\Labels\me-device.lbx` |
| バーコードオブジェクト名 | `Barcode` |
| 機器名テキスト | `txtName` |

## 3. アプリでの印刷

1. **機器台帳** を開く
2. 行の **プリンターアイコン** で 1 件、または複数選択して **ラベル印刷**
3. **P-touch で印刷** … b-PAC 経由でテンプレートに ME No. を流し込み
4. **ブラウザで印刷** … b-PAC なしでプレビュー印刷（プリンタに P-touch を選べば同じ機器で印刷可能）

## トラブルシュート

| 症状 | 対処 |
|------|------|
| b-PAC: 未検出 | SDK 再インストール、拡張機能有効化、ページ再読み込み |
| テンプレートを開けない | パスは **絶対パス**、`.lbx` の共有ドライブは不可のことがある |
| バーコードが印字されない | オブジェクト名がテンプレートと一致しているか確認 |

## Supabase との関係

印刷データは Web アプリが Supabase から取得した `devices.barcode`（ME No.）を使用します。追加の DB マイグレーションは不要です。
