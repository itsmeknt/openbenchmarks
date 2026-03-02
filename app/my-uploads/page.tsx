import { auth } from '@/lib/auth'
import { signIn } from '@/lib/auth'
import MyUploadsClient from '@/components/MyUploadsClient'

export default async function MyUploadsPage() {
  const session = await auth()

  if (!session?.user) {
    return (
      <div style={{ padding: '24px', maxWidth: 600, margin: '60px auto', textAlign: 'center' }}>
        <div className="card">
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Sign in to view uploads</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 20px' }}>
            You need to sign in with GitHub to manage your runs.
          </p>
          <form action={async () => { 'use server'; await signIn('github') }}>
            <button type="submit" className="btn btn-primary">Sign in with GitHub</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.03em' }}>My Uploads</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Manage your evaluated benchmark runs.
        </p>
      </div>
      <MyUploadsClient />
    </div>
  )
}
