# P-touch（Brother）ラベル印刷のセットアップ



機器台帳の **ME No.**（`devices.barcode`）を CODE128 バーコードとして P-touch ラベルに印刷します。



## 前提



- **Windows PC**（病院のラベル印刷用 PC）

- Brother P-touch ラベルプリンター（QL シリーズなど b-PAC 対応機種）

- プリンタードライバー・**P-touch Editor**

- **b-PAC SDK**（**32bit 版**を推奨。64bit のみだと動かないことがあります）

- **b-PAC クライアント**（SDK ダウンロードページの Client 項目）

- ブラウザ **Chrome または Edge** + **Brother b-PAC Extension**



## 1. Brother ソフトのインストール



1. [b-PAC ダウンロード](https://support.brother.com/g/s/es/dev/en/bpac/download/index.html) から **SDK（32bit）** と **b-PAC Client** をインストール

2. ブラウザ拡張を追加:

   - [Chrome 用](https://chromewebstore.google.com/detail/ilpghlfadkjifilabejhhijpfphfcfhb)

   - [Edge 用](https://microsoftedge.microsoft.com/addons/detail/brother-bpac-extension/kmopihekhjobijiipnloimfdgjddbnhg)

3. 拡張機能の詳細設定で **このアプリの URL**（例: `https://xxxx.vercel.app` または `http://localhost:3000`）を **オン** にする

4. P-touch Editor でラベルテンプレート（`.lbx`）を作成



### b-PAC「検出済み」になる仕組み



アプリは `window.bpac` ではなく、拡張機能が `<body>` に付けるクラス **`bpac-extension-installed`** を見て判定します。  

拡張が有効でもクラスが付かない場合は、上記 2〜3（拡張のインストールとサイト許可）を再確認し、ページを **再読み込み** して「**再検出**」を押してください。



## 2. テンプレート（.lbx）の作り方



1. P-touch Editor で新規ラベル（使用テープサイズに合わせる。例: 62mm×29mm）

2. **バーコード** オブジェクトを配置 → オブジェクト名を `Barcode` に（プロパティで名前を変更）

3. 必要なら **テキスト** を追加 → 名前を `txtName` に（機種名表示用）

4. **英数字のみのパス**で保存（日本語フォルダ名だと Web から開けないことがあります）  
   推奨: `C:\Labels\me-device.lbx`



アプリの「P-touch 設定」で次を入力します。



| 項目 | 例 |

|------|-----|

| テンプレートパス | `C:\Labels\me-device.lbx` |

| バーコードオブジェクト名 | `Barcode` |

| 機器名テキスト | `txtName` |



## 3. アプリでの印刷



1. **機器台帳** を開く

2. 行の **プリンターアイコン** で 1 件、または **ラベル印刷** で表示中の一括

3. ダイアログで **b-PAC Extension: 検出済み** を確認

4. **P-touch で印刷** … b-PAC 経由でテンプレートに ME No. を流し込み

5. **ブラウザで印刷** … 拡張なしの代替（印刷ダイアログで P-touch を選択）



## トラブルシュート



| 症状 | 対処 |

|------|------|

| b-PAC: **未検出** | ① SDK+Client（32bit）② 拡張インストール ③ **このサイトを拡張で許可** ④ F5 再読み込み ⑤「再検出」 |

| 検出済みだが印刷失敗 | `.lbx` の絶対パス、オブジェクト名、プリンター電源・USB/Wi-Fi |

| テンプレートを開けない | **英数字のみのパス**（例: `C:\Labels\me-device.lbx`）。日本語フォルダ（デスクトップ上の病院名フォルダ等）は避ける |
| 同上 | 絶対パス、P-touch Editor から同ファイルが開けるか確認 |

| バーコードが印字されない | テンプレートのバーコードオブジェクト名が `Barcode` 等と一致しているか |



## Supabase との関係



印刷データは Web アプリが Supabase から取得した `devices.barcode`（ME No.）を使用します。追加の DB マイグレーションは不要です。


