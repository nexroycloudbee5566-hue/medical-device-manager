import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const sqlPath = path.join(process.cwd(), 'supabase', 'fix_profile_auth_secrets.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  return new NextResponse(sql, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
