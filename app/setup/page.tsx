'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Stethoscope,
  ChevronRight,
  Copy,
  ExternalLink,
  RefreshCw,
  Key,
  Database,
  User,
} from 'lucide-react'

const STEPS = ['接続設定', 'DBスキーマ', '管理者作成'] as const
type Step = 0 | 1 | 2

function loadSession() {
  try {
    const raw = sessionStorage.getItem('setup')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSession(data: Record<string, string | number>) {
  try { sessionStorage.setItem('setup', JSON.stringify(data)) } catch {}
}

export default function SetupPage() {
  const session = typeof window !== 'undefined' ? loadSession() : {}

  const [step, setStep] = useState<Step>((session.step as Step) ?? 0)
  const [done, setDone] = useState(false)

  // Step 0 state
  const [supabaseUrl, setSupabaseUrl] = useState<string>(session.supabaseUrl ?? '')
  const [anonKey, setAnonKey] = useState<string>(session.anonKey ?? '')
  const [serviceRoleKey, setServiceRoleKey] = useState<string>(session.serviceRoleKey ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Step 1 state
  const [schemaChecking, setSchemaChecking] = useState(false)
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null)
  const [schemaHospitals, setSchemaHospitals] = useState<boolean | null>(null)
  const [schemaPinAuth, setSchemaPinAuth] = useState<boolean | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)
  const [copiedPinSql, setCopiedPinSql] = useState(false)

  // Step 2 state
  const [adminPin, setAdminPin] = useState('')
  const [adminName, setAdminName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleSaveEnv(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    const res = await fetch('/api/setup/save-env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl, anonKey, serviceRoleKey }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveError(data.error); return }
    // URL を正規化された形（末尾スラッシュ除去）に揃える
    const normUrl = supabaseUrl.replace(/\/$/, '')
    const normAnon = anonKey.trim()
    const normSrk = serviceRoleKey.trim()
    setSupabaseUrl(normUrl)
    setServiceRoleKey(normSrk)
    setAnonKey(normAnon)
    saveSession({ step: 1, supabaseUrl: normUrl, anonKey: normAnon, serviceRoleKey: normSrk })
    setStep(1)
  }

  async function checkSchema() {
    setSchemaChecking(true)
    setSchemaReady(null)
    setSchemaHospitals(null)
    setSchemaPinAuth(null)
    const res = await fetch('/api/setup/check-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl, serviceRoleKey }),
    })
    const data = await res.json()
    setSchemaChecking(false)
    setSchemaHospitals(!!data.hospitals)
    setSchemaPinAuth(!!data.profileAuthSecrets)
    setSchemaReady(!!data.ready)
  }

  async function copySql() {
    const res = await fetch('/api/setup/schema')
    const text = await res.text()
    await navigator.clipboard.writeText(text)
    setCopiedSql(true)
    setTimeout(() => setCopiedSql(false), 2000)
  }

  async function copyPinSql() {
    const res = await fetch('/api/setup/pin-auth-sql')
    const text = await res.text()
    await navigator.clipboard.writeText(text)
    setCopiedPinSql(true)
    setTimeout(() => setCopiedPinSql(false), 2000)
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    const res = await fetch('/api/setup/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl, serviceRoleKey, name: adminName, pin: adminPin }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error); return }
    try { sessionStorage.removeItem('setup') } catch {}
    setDone(true)
  }

  const supabaseEditorUrl = supabaseUrl
    ? `https://supabase.com/dashboard/project/${supabaseUrl.replace('https://', '').split('.')[0]}/sql/new`
    : 'https://supabase.com/dashboard'

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-slate-100 p-4">
        <Card className="max-w-md w-full border-0 shadow-lg text-center">
          <CardContent className="pt-10 pb-10 space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-green-100 rounded-full">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">セットアップ完了！</h2>
            <p className="text-slate-500 text-sm">
              開発サーバーを再起動して、ログイン画面からアクセスしてください。
            </p>
            <div className="bg-slate-900 text-green-400 rounded-lg px-4 py-3 text-sm font-mono text-left">
              npm run dev
            </div>
            <Button className="w-full" onClick={() => window.location.href = '/auth/login'}>
              ログイン画面へ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto space-y-6 py-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg">
              <Stethoscope className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">医療機器管理システム</h1>
          <p className="text-slate-500 text-sm">初回セットアップウィザード</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                i < step ? 'bg-green-100 text-green-700' :
                i === step ? 'bg-blue-600 text-white' :
                'bg-slate-100 text-slate-400'
              }`}>
                {i < step ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="w-4 h-4 flex items-center justify-center text-xs">{i + 1}</span>}
                {label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 0: Supabase credentials */}
        {step === 0 && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Key className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Supabase 接続設定</CardTitle>
                  <CardDescription className="mt-0.5">
                    <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      Supabase ダッシュボード <ExternalLink className="h-3 w-3" />
                    </a>
                    &nbsp;→ Settings → API から取得してください
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveEnv} className="space-y-4">
                {saveError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{saveError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1.5">
                  <Label>Project URL</Label>
                  <Input
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>anon public キー</Label>
                  <Input
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>service_role キー</Label>
                  <Input
                    value={serviceRoleKey}
                    onChange={(e) => setServiceRoleKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    required
                  />
                  <p className="text-xs text-slate-400">管理者ユーザーの作成に使用します。本番環境では安全に管理してください。</p>
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />接続確認中...</> : '接続して次へ'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Schema setup */}
        {step === 1 && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Database className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle>データベーススキーマの適用</CardTitle>
                  <CardDescription className="mt-0.5">Supabase の SQL エディタで、以下の SQL を実行してください</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">手順</p>
                </div>
                <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
                  <li>
                    <a href={supabaseEditorUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      Supabase SQL エディタを開く <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>下の「SQLをコピー」ボタンでSQLをコピー</li>
                  <li>SQL エディタに貼り付けて「Run」をクリック</li>
                  <li>完了したら「スキーマの確認」ボタンを押す</li>
                </ol>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copySql}>
                  {copiedSql ? <><CheckCircle className="h-4 w-4 mr-2 text-green-600" />コピーしました!</> : <><Copy className="h-4 w-4 mr-2" />SQLをコピー</>}
                </Button>
                <Button variant="outline" onClick={() => window.open(supabaseEditorUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  SQL エディタを開く
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={checkSchema}
                  disabled={schemaChecking}
                >
                  {schemaChecking
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />確認中...</>
                    : <><RefreshCw className="h-4 w-4 mr-2" />スキーマの確認</>}
                </Button>

                {schemaReady === true && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">
                      スキーマが正常に作成されました（PIN ログイン用テーブル含む）。
                    </AlertDescription>
                  </Alert>
                )}
                {schemaHospitals === true && schemaPinAuth === false && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 space-y-2">
                      <p>
                        基本テーブルはありますが、<strong>profile_auth_secrets</strong>（PIN ログイン用）が未作成か、まだ反映されていません。
                        下の「PIN用SQLをコピー」を SQL エディタで Run してください（結果が <strong>Success. No rows returned</strong> で問題ありません）。
                        数十秒後に「スキーマの確認」を再度押してください。
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={copyPinSql}>
                        {copiedPinSql ? (
                          <><CheckCircle className="h-4 w-4 mr-2 text-green-600" />コピーしました</>
                        ) : (
                          <><Copy className="h-4 w-4 mr-2" />PIN用SQLをコピー</>
                        )}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                {schemaReady === false && schemaHospitals !== true && (
                  <Alert className="border-orange-200 bg-orange-50">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-700">
                      スキーマがまだ作成されていません。上の「SQLをコピー」で schema.sql を実行してから再度確認してください。
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Button
                className="w-full"
                onClick={() => {
                  saveSession({ step: 2, supabaseUrl, anonKey, serviceRoleKey })
                  setStep(2)
                }}
                disabled={schemaReady !== true}
              >
                次へ：管理者アカウント作成
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Create admin user */}
        {step === 2 && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <User className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>管理者アカウントの作成</CardTitle>
                  <CardDescription className="mt-0.5">最初の管理者（admin）CEアカウントを作成します</CardDescription>
                </div>
              </div>
              {!supabaseUrl && (
                <Alert className="mt-3 border-orange-200 bg-orange-50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-700 text-sm">
                    接続情報が失われました。
                    <button className="underline ml-1" onClick={() => setStep(0)}>Step 1 からやり直してください</button>
                  </AlertDescription>
                </Alert>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                {createError && (
                  <Alert variant="destructive" className="items-start">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <AlertDescription className="whitespace-pre-wrap text-xs leading-relaxed">
                      {createError}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1.5">
                  <Label>氏名 *</Label>
                  <Input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="山田 太郎"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>管理者PIN *（8桁の数字）</Label>
                  <Input
                    inputMode="numeric"
                    type="password"
                    pattern="\d*"
                    maxLength={8}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="12345678"
                    required
                  />
                  <p className="text-xs text-slate-500">ログイン画面の「管理者」タブで使用します</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <Badge className="bg-blue-600 text-white border-0 text-xs">admin</Badge>
                    <span>このアカウントは管理者権限で作成されます</span>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />作成中...</> : '管理者アカウントを作成'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400">
          設定ファイルは <code className="bg-slate-100 px-1 rounded">.env.local</code> に保存されます
        </p>
      </div>
    </div>
  )
}
