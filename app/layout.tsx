import type { Metadata } from 'next'
import './globals.css'
import { auth } from '@/lib/auth'
import NavClient from '@/components/NavClient'

export const metadata: Metadata = {
  title: 'EvalHub',
  description: 'Community-powered LLM benchmark aggregator',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en">
      <body>
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.02em',
              }}>
                Open<span style={{ color: 'var(--primary)', fontWeight: 300 }}>Benchmarks</span>
              </span>
            </a>
            <div style={{ display: 'flex', gap: '4px' }}>
              <NavLink href="/">Leaderboard</NavLink>
              <NavLink href="/upload">Submit Run</NavLink>
              <NavLink href="/my-uploads">My Uploads</NavLink>
            </div>
          </div>
          <NavClient user={session?.user ?? null} />
        </nav>
        <main style={{ minHeight: 'calc(100vh - 57px)' }}>
          {children}
        </main>
      </body>
    </html>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className="nav-link">{children}</a>
}
