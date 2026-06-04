import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-slate-50 p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">ページが見つかりません</h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          URL が違うか、このアドレスにはページがありません。一部の機能はログイン後にご利用いただけます。
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link href="/auth/login" className="text-sm font-medium text-blue-600 underline underline-offset-4">
          ログイン画面へ
        </Link>
        <Link href="/" className="text-sm font-medium text-slate-600 underline underline-offset-4">
          トップへ
        </Link>
      </div>
    </div>
  )
}
