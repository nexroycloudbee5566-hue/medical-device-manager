'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Device } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Printer, RefreshCw, Settings2 } from 'lucide-react'
import {
  DEFAULT_PTOUCH_SETTINGS,
  loadPtouchSettings,
  savePtouchSettings,
  type PtouchPrintSettings,
} from '@/lib/ptouch/settings'
import {
  BPAC_CHROME_EXTENSION_URL,
  BPAC_EDGE_EXTENSION_URL,
  getBpacDetectStatus,
  waitForBpacExtension,
} from '@/lib/ptouch/bpac-detect'
import { printMeLabelViaBpac } from '@/lib/ptouch/bpac-client'
import { printMeLabelsInBrowser } from '@/lib/ptouch/browser-label-print'
import { RECOMMENDED_LBX_DIR } from '@/lib/ptouch/lbx-path'

export type MeLabelPrintTarget = Pick<Device, 'barcode' | 'name' | 'location'>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  targets: MeLabelPrintTarget[]
}

export function MeLabelPrintDialog({ open, onOpenChange, targets }: Props) {
  const [copies, setCopies] = useState(1)
  const [busy, setBusy] = useState(false)
  const [bpacReady, setBpacReady] = useState(false)
  const [bpacChecking, setBpacChecking] = useState(false)
  const [browserHint, setBrowserHint] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<PtouchPrintSettings>(DEFAULT_PTOUCH_SETTINGS)

  const refreshBpacStatus = useCallback(async () => {
    setBpacChecking(true)
    try {
      const ok = await waitForBpacExtension(3000)
      setBpacReady(ok)
      setBrowserHint(getBpacDetectStatus().browserHint)
    } finally {
      setBpacChecking(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSettings(loadPtouchSettings())
    void refreshBpacStatus()
  }, [open, refreshBpacStatus])

  const rows = targets
    .map((t) => ({
      meNo: t.barcode?.trim() ?? '',
      deviceName: t.name?.trim() ?? '',
    }))
    .filter((r) => r.meNo)

  async function handleBpacPrint() {
    if (rows.length === 0) {
      alert('ME No. が設定された機器がありません。')
      return
    }
    savePtouchSettings(settings)
    setBusy(true)
    try {
      for (const row of rows) {
        for (let c = 0; c < copies; c++) {
          const result = await printMeLabelViaBpac({
            templatePath: settings.templatePath,
            meNo: row.meNo,
            deviceName: row.deviceName,
            copies: 1,
            barcodeObjectName: settings.barcodeObjectName,
            nameObjectName: settings.nameObjectName,
          })
          if (!result.ok) {
            alert(result.error)
            await refreshBpacStatus()
            return
          }
        }
      }
      alert(`${rows.length} 件 × ${copies} 枚を P-touch に送信しました。`)
    } finally {
      setBusy(false)
    }
  }

  function handleBrowserPrint() {
    savePtouchSettings(settings)
    setBusy(true)
    try {
      const result = printMeLabelsInBrowser(rows, copies)
      if (!result.ok) {
        alert(result.error)
        return
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            ME No. ラベル印刷
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-600 leading-relaxed">
          台帳（Supabase）の ME No. から CODE128 バーコードを作成して印刷します。
          P-touch 直結には <strong>Windows</strong>・<strong>b-PAC SDK</strong>・<strong>ブラウザ拡張</strong> が必要です。
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm space-y-1">
          <p className="font-medium text-slate-800">
            対象: {targets.length} 件（印刷可能: {rows.length} 件）
          </p>
          {rows.length > 0 && rows.length <= 5 && (
            <ul className="text-xs text-slate-600 font-mono list-disc pl-4">
              {rows.map((r) => (
                <li key={r.meNo}>
                  {r.meNo}
                  {r.deviceName ? ` — ${r.deviceName}` : ''}
                </li>
              ))}
            </ul>
          )}
          {targets.length > rows.length && (
            <p className="text-xs text-amber-800">ME No. 未設定の機器はスキップされます。</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-600">
            b-PAC Extension:{' '}
            {bpacChecking ? (
              <span className="text-slate-500">確認中…</span>
            ) : bpacReady ? (
              <span className="text-green-700 font-medium">検出済み</span>
            ) : (
              <span className="text-amber-800 font-medium">未検出</span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            disabled={bpacChecking}
            onClick={() => void refreshBpacStatus()}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${bpacChecking ? 'animate-spin' : ''}`} />
            再検出
          </Button>
        </div>

        {!bpacReady && !bpacChecking && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-950 space-y-2 leading-relaxed">
            <p className="font-medium">b-PAC が未検出のときの確認</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                <a href={BPAC_CHROME_EXTENSION_URL} target="_blank" rel="noreferrer" className="underline">
                  Chrome 用拡張
                </a>
                {' / '}
                <a href={BPAC_EDGE_EXTENSION_URL} target="_blank" rel="noreferrer" className="underline">
                  Edge 用拡張
                </a>
                をインストール
              </li>
              <li>
                拡張機能の設定で <strong>このサイト（medical-device-manager の URL）</strong> をオンにする
              </li>
              <li>b-PAC SDK（32bit）と b-PAC クライアントを Windows にインストール</li>
              <li>ページを再読み込み →「再検出」</li>
            </ol>
            <p className="text-amber-900/80">{browserHint}</p>
          </div>
        )}

        <div className="space-y-1.5 max-w-[8rem]">
          <Label>印刷枚数（各機器）</Label>
          <Input
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-slate-600"
          onClick={() => setShowSettings((v) => !v)}
        >
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          P-touch 設定（.lbx テンプレート）
        </Button>

        {showSettings && (
          <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <p className="text-xs text-blue-900 leading-relaxed">
              P-touch Editor でラベルを作成し、バーコードオブジェクト名を下記と一致させて .lbx で保存してください。
              詳細は <code className="bg-white/80 px-1 rounded">docs/ptouch-setup.md</code> を参照。
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">テンプレート (.lbx) の絶対パス</Label>
              <Input
                value={settings.templatePath}
                onChange={(e) => setSettings((s) => ({ ...s, templatePath: e.target.value }))}
                placeholder={RECOMMENDED_LBX_DIR}
                className="bg-white text-sm font-mono"
              />
              <p className="text-[11px] text-amber-900/90 leading-relaxed">
                日本語フォルダ内の .lbx は開けないことがあります。{' '}
                <code className="bg-white/80 px-1 rounded">{RECOMMENDED_LBX_DIR}</code>{' '}
                など英数字のみのパスを推奨します。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">バーコードオブジェクト名</Label>
                <Input
                  value={settings.barcodeObjectName}
                  onChange={(e) => setSettings((s) => ({ ...s, barcodeObjectName: e.target.value }))}
                  className="bg-white text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">機種名テキスト（任意）</Label>
                <Input
                  value={settings.nameObjectName}
                  onChange={(e) => setSettings((s) => ({ ...s, nameObjectName: e.target.value }))}
                  className="bg-white text-sm"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            閉じる
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || rows.length === 0}
            onClick={handleBrowserPrint}
          >
            ブラウザで印刷
          </Button>
          <Button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => void handleBpacPrint()}
            title={!bpacReady ? '未検出でも印刷を試せます（拡張があれば動作）' : undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
            P-touch で印刷
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
