import { NextResponse, type NextRequest } from 'next/server'
import {
  devLifecycleEnter,
  devLifecycleHeartbeat,
  devLifecycleIsEnabled,
  devLifecycleLeave,
} from '@/lib/dev-server-lifecycle-state'

export const runtime = 'nodejs'

function isLocalRequest(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0]
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

export async function POST(request: NextRequest) {
  if (!devLifecycleIsEnabled()) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: { action?: string; tabId?: string }
  try {
    body = (await request.json()) as { action?: string; tabId?: string }
  } catch {
    body = {}
  }

  const tabId = typeof body.tabId === 'string' ? body.tabId : ''

  switch (body.action) {
    case 'enter':
      devLifecycleEnter(tabId)
      break
    case 'leave':
      devLifecycleLeave(tabId)
      break
    case 'heartbeat':
      devLifecycleHeartbeat(tabId)
      break
    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}