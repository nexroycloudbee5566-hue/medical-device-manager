import fs from 'node:fs/promises'
import path from 'node:path'
import { BookOpen } from 'lucide-react'
import { ManualMarkdown } from '@/components/manual-markdown'

export default async function ManualPage() {
  const filePath = path.join(process.cwd(), 'docs', 'manual.md')
  let content = ''
  let error: string | null = null

  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch {
    error = 'マニュアルファイル（docs/manual.md）を読み込めませんでした。'
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-blue-600" />
          使い方マニュアル
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">スタッフ向け操作ガイド</p>
      </div>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      ) : (
        <ManualMarkdown content={content} />
      )}
    </div>
  )
}
