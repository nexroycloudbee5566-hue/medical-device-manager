import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { DevServerLifecycle } from '@/components/dev-server-lifecycle'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: '医療機器管理システム',
  description: 'グループ病院 医療機器管理・依頼管理システム',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geist.variable} h-full`}>
      <body
        className="h-full bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        <DevServerLifecycle />
        {children}
      </body>
    </html>
  )
}
