import { fetchPinLoginProfiles } from '@/lib/profile-options'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ mode?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const mode = params.mode === 'admin' ? 'admin' : 'staff'

  const [staff, admin] = await Promise.all([
    fetchPinLoginProfiles('staff'),
    fetchPinLoginProfiles('admin'),
  ])

  return <LoginForm key={mode} mode={mode} staff={staff} admin={admin} />
}
