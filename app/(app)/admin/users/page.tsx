'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, Hospital, UserRole } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  RefreshCw,
  Users,
  Edit,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  User,
} from 'lucide-react'
import { validateAdminPin, validateStaffPin } from '@/lib/pin-auth'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const emptyUserForm = {
  name: '',
  pin: '',
  role: 'staff' as UserRole,
  hospital_id: '',
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [newUserOpen, setNewUserOpen] = useState(false)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState(emptyUserForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editPin, setEditPin] = useState('')
  const [editPinConfirm, setEditPinConfirm] = useState('')

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const [profRes, hosRes, curRes] = await Promise.all([
      supabase.from('profiles').select('*, hospitals(name)').order('created_at'),
      supabase.from('hospitals').select('*').order('name'),
      user ? supabase.from('profiles').select('*').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ])
    setProfiles((profRes.data as Profile[]) ?? [])
    setHospitals((hosRes.data as Hospital[]) ?? [])
    setCurrentUser(curRes.data as Profile | null)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isAdmin = currentUser?.role === 'admin'

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        pin: form.pin,
        role: form.role,
        hospital_id: form.hospital_id || null,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error ?? 'エラーが発生しました')
      setSaving(false)
      return
    }
    setSaving(false)
    setNewUserOpen(false)
    setForm(emptyUserForm)
    fetchAll()
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!editProfile) return
    setSaving(true)
    setError(null)

    await supabase.from('profiles').update({
      name: form.name,
      role: form.role,
      hospital_id: form.hospital_id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editProfile.id)

    if (editPin.trim() || editPinConfirm.trim()) {
      if (editPin !== editPinConfirm) {
        setError('新しいPINと確認用PINが一致しません')
        setSaving(false)
        return
      }
      const ok = form.role === 'admin' ? validateAdminPin(editPin) : validateStaffPin(editPin)
      if (!ok) {
        setError(form.role === 'admin' ? '管理者PINは8桁の数字です' : '一般用PINは6桁の数字です')
        setSaving(false)
        return
      }
      const res = await fetch('/api/admin/set-user-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editProfile.id, pin: editPin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'PIN の更新に失敗しました')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditProfile(null)
    setForm(emptyUserForm)
    setEditPin('')
    setEditPinConfirm('')
    fetchAll()
  }

  function openEdit(profile: Profile) {
    setForm({
      name: profile.name,
      pin: '',
      role: profile.role,
      hospital_id: profile.hospital_id ?? '',
    })
    setEditPin('')
    setEditPinConfirm('')
    setEditProfile(profile)
  }

  if (!isAdmin && !loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert className="border-red-200 bg-red-50 max-w-md">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700">
            このページは管理者（admin）のみアクセスできます。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ユーザー管理</h1>
          <p className="text-slate-500 text-sm mt-0.5">CEアカウントの作成・管理（管理者専用）</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-1.5" />更新
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyUserForm); setNewUserOpen(true) }}>
            <Plus className="h-4 w-4 mr-1.5" />ユーザー追加
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5 border-0 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">総ユーザー数</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{profiles.length}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
        </Card>
        <Card className="p-5 border-0 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">管理者</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{profiles.filter((p) => p.role === 'admin').length}</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
          </div>
        </Card>
        <Card className="p-5 border-0 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">一般CE</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{profiles.filter((p) => p.role === 'staff').length}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-xl">
            <User className="h-5 w-5 text-green-600" />
          </div>
        </Card>
      </div>

      {/* Users table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />読み込み中...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>氏名</TableHead>
                <TableHead>権限</TableHead>
                <TableHead>所属拠点</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">
                    {profile.name || '（名前未設定）'}
                    {profile.id === currentUser?.id && (
                      <Badge className="ml-2 bg-blue-100 text-blue-700 border-0 text-xs">あなた</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={profile.role === 'admin'
                      ? 'bg-purple-100 text-purple-700 border-0'
                      : 'bg-slate-100 text-slate-600 border-0'}>
                      {profile.role === 'admin' ? '管理者' : '一般CE'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {(profile as any).hospitals?.name ?? '未設定'}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {format(new Date(profile.created_at), 'yyyy/MM/dd', { locale: ja })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(profile)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-4 w-4 text-slate-400" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create user dialog */}
      <Dialog open={newUserOpen} onOpenChange={(v) => {
        if (!v) {
          setNewUserOpen(false)
          setForm(emptyUserForm)
          setError(null)
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新規ユーザー追加</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label>氏名 *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="山田 太郎" required />
            </div>
            <div className="space-y-1.5">
              <Label>初期PIN *</Label>
              <Input
                inputMode="numeric"
                type="password"
                pattern="\d*"
                maxLength={form.role === 'admin' ? 8 : 6}
                value={form.pin}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  pin: e.target.value.replace(/\D/g, '').slice(0, f.role === 'admin' ? 8 : 6),
                }))}
                placeholder={form.role === 'admin' ? '8桁の数字' : '6桁の数字'}
                required
              />
              <p className="text-xs text-slate-500">
                {form.role === 'admin' ? '管理者は 8 桁' : '一般用は 6 桁'}の数字PINです
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>権限</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({
                    ...f,
                    role: (v ?? 'staff') as UserRole,
                    pin: '',
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">一般CE</SelectItem>
                    <SelectItem value="admin">管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>所属拠点</Label>
                <Select value={form.hospital_id} onValueChange={(v) => setForm((f) => ({ ...f, hospital_id: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">未設定</SelectItem>
                    {hospitals.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setNewUserOpen(false); setForm(emptyUserForm); setError(null) }}>
                キャンセル
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                追加する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={!!editProfile} onOpenChange={(v) => {
        if (!v) {
          setEditProfile(null)
          setForm(emptyUserForm)
          setEditPin('')
          setEditPinConfirm('')
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>プロフィール編集</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateProfile} className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label>氏名 *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>権限</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({
                  ...f,
                  role: (v ?? 'staff') as UserRole,
                }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">一般CE</SelectItem>
                    <SelectItem value="admin">管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>所属拠点</Label>
                <Select value={form.hospital_id} onValueChange={(v) => setForm((f) => ({ ...f, hospital_id: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">未設定</SelectItem>
                    {hospitals.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-dashed border-slate-200 p-3 space-y-3">
              <p className="text-sm font-medium text-slate-700">PIN を変更（任意）</p>
              <div className="space-y-1.5">
                <Label>新しいPIN</Label>
                <Input
                  inputMode="numeric"
                  type="password"
                  pattern="\d*"
                  maxLength={form.role === 'admin' ? 8 : 6}
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, form.role === 'admin' ? 8 : 6))}
                  placeholder={form.role === 'admin' ? '8桁' : '6桁'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>新しいPIN（確認）</Label>
                <Input
                  inputMode="numeric"
                  type="password"
                  pattern="\d*"
                  maxLength={form.role === 'admin' ? 8 : 6}
                  value={editPinConfirm}
                  onChange={(e) => setEditPinConfirm(e.target.value.replace(/\D/g, '').slice(0, form.role === 'admin' ? 8 : 6))}
                  placeholder={form.role === 'admin' ? '8桁' : '6桁'}
                />
              </div>
              <p className="text-xs text-slate-500">
                空のままなら PIN は変更されません。権限に応じて {form.role === 'admin' ? '8' : '6'} 桁の数字です。
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setEditProfile(null); setForm(emptyUserForm) }}>
                キャンセル
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                保存する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
