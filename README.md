# 医療機器管理システム

グループ病院向けの医療機器管理・依頼管理Webアプリケーション。

## セットアップ（3ステップ）

### 1. Supabase プロジェクトを作成する

[https://supabase.com](https://supabase.com) でアカウント作成 → 新規プロジェクト作成

### 2. アプリを起動する

```bash
npm install
npm run dev
```

### 3. ブラウザでセットアップウィザードを完了する

[http://localhost:3000](http://localhost:3000) を開くと **セットアップウィザード** が自動で表示されます。

| ステップ | 内容 |
|---|---|
| **①接続設定** | Supabase URL / anon key / service_role key を入力 |
| **②DBスキーマ** | SQLをワンクリックでコピー → Supabase SQL エディタで実行 |
| **③管理者作成** | 氏名と **管理者用PIN（8桁）** で最初の管理者アカウントを作成 |

> Supabase の API キーは **Settings → API** から取得できます。

## ログイン（PIN）

メール・パスワードは使いません。**名前を選んで PIN を入力**します。

| 種別 | PIN |
|---|---|
| **一般用** | 6桁の数字（ログイン画面の「一般用」タブ） |
| **管理者** | 8桁の数字（ログイン画面の「管理者」タブ） |

既に旧スキーマのみ適用済みの場合は、`supabase/migration_pin_auth.sql` を SQL エディタで実行してください。

### エラー: `Could not find the table 'public.profile_auth_secrets' in the schema cache`

1. Supabase ダッシュボード → **SQL Editor** を開く  
2. 次を **そのまま貼り付けて Run** する（未作成なら作成し、キャッシュも更新します）:

```sql
create table if not exists public.profile_auth_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  login_secret text not null,
  created_at timestamptz default now()
);

alter table public.profile_auth_secrets enable row level security;

notify pgrst, 'reload schema';
```

3. 数十秒待ってからアプリを再読み込みする。まだ同じなら Supabase の **Project Settings → Pause project → Restore** は不要で、通常は **別ブラウザタブで SQL Editor を開き直して** テーブル一覧に `profile_auth_secrets` が出るか確認する。

---

## 機能

| 画面 | 機能 |
|---|---|
| ダッシュボード | 進行中の修理・購入依頼一覧、ステータス管理（Realtime同期） |
| 機器台帳 | ME No.・バーコード検索、Excel取込（榊原温泉病院 医療機器台帳 完成版） |
| メンテナンス管理 | 点検期限アラート・点検記録登録 |
| 履歴管理 | 完了依頼・点検履歴の検索・絞り込み |
| ユーザー管理 | CEアカウントの作成・管理（管理者限定） |

## 業務フロー（ステータス遷移）

```
修理依頼: 依頼受付 → 確認中 → 選定 → 業者見積依頼 → 見積受取 → 院内決済 → 業者報告 → 修理 → 完了
購入依頼: 依頼受付 → 確認中 → 選定 → 業者見積依頼 → 見積受取 → 院内決済 → 業者報告 → 購入 → 完了
```

## 技術スタック

Next.js 16 + TypeScript + Supabase (PostgreSQL / Auth / Realtime) + Tailwind CSS + shadcn/ui

## 本番デプロイ (Vercel)

詳細手順は **[DEPLOY.md](./DEPLOY.md)** を参照してください。

1. Supabase にスキーマ適用・管理者作成（ローカル `/setup` 推奨）
2. GitHub にリポジトリをプッシュ
3. [Vercel](https://vercel.com) にインポート
4. 環境変数を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. デプロイ後、Supabase の **Authentication → URL Configuration** に本番 URL を登録
