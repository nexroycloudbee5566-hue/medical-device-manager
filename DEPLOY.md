# 本番デプロイ手順（Vercel + Supabase）

医療機器管理システムをインターネット上に公開する手順です。

## 事前準備（ローカルで完了していること）

- [ ] Supabase プロジェクト作成済み
- [ ] `supabase/schema.sql` を SQL Editor で実行済み
- [ ] `profile_auth_secrets` テーブルあり（PIN ログイン用）
- [ ] ローカル `/setup` で **管理者（8桁PIN）** を1人以上作成済み
- [ ] ローカルで `npm run build` が成功する

---

## 方法 A: Vercel ダッシュボード（おすすめ）

### 1. コードを GitHub に置く

Git が入っていない場合は [Git for Windows](https://git-scm.com/download/win) をインストールしてください。

```powershell
cd C:\Users\STH-ME002D\medical-device-manager
git init
git add .
git commit -m "Initial deploy"
```

GitHub で新規リポジトリを作成し、表示される URL で push:

```powershell
git remote add origin https://github.com/<あなたのユーザー>/<リポジトリ名>.git
git branch -M main
git push -u origin main
```

### 2. Vercel にインポート

1. [https://vercel.com](https://vercel.com) にログイン
2. **Add New → Project**
3. GitHub のリポジトリ `medical-device-manager` を選択
4. Framework: **Next.js**（自動検出）
5. **Environment Variables** に次を追加（Production）:

| 名前 | 値の取得場所 |
|------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同画面 → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | 同画面 → service_role（**秘密**） |

6. **Deploy** をクリック

### 3. Supabase の Auth 設定

デプロイ後、表示された URL（例: `https://xxxx.vercel.app`）を Supabase に登録:

1. Supabase → **Authentication** → **URL Configuration**
2. **Site URL**: `https://xxxx.vercel.app`
3. **Redirect URLs** に同じ URL を追加

### 4. 動作確認

1. `https://xxxx.vercel.app/auth/login` を開く
2. タイトルが **「医療機器管理システム」** であること（看護ベッドサイドツールではない）
3. 管理者タブ → 名前選択 → **8桁 PIN** でログイン

> 本番の `/setup` ステップ①はサーバーに `.env` を書けないため、**環境変数は Vercel 側で設定**し、管理者はローカル setup 済みの DB をそのまま使うか、`/api/setup/create-admin` で作成してください。

---

## 方法 B: Vercel CLI（Git なしでも可）

```powershell
cd C:\Users\STH-ME002D\medical-device-manager
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel --prod
```

初回はブラウザで Vercel ログインが求められます。

---

## 環境変数の注意

- `SUPABASE_SERVICE_ROLE_KEY` に **`NEXT_PUBLIC_` を付けない**（ブラウザに漏れるため）
- `.env.local` は Git に含めない（`.gitignore` 済み）
- 環境変数変更後は Vercel で **Redeploy** が必要

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| ログイン画面に管理者が出ない | DB に `profile_auth_secrets` と `role=admin` のユーザーがあるか SQL で確認 |
| ビルド失敗 | ローカルで `npm run build` を実行してエラーを修正 |
| 別アプリが表示される | URL が看護ツールの `localhost:3010` 等になっていないか確認 |
| PIN ログイン後にエラー | Supabase の Site URL / Redirect URLs を本番 URL に合わせる |

---

## 管理者を本番 DB に追加する（curl 例）

ローカル setup が済んでいない場合のみ。`service_role` は他人に見せないでください。

```powershell
curl -X POST "https://<your-app>.vercel.app/api/setup/create-admin" `
  -H "Content-Type: application/json" `
  -d "{\"supabaseUrl\":\"https://xxxx.supabase.co\",\"serviceRoleKey\":\"<service_role>\",\"name\":\"管理者名\",\"pin\":\"12345678\"}"
```

PIN は **8桁の数字**です。
