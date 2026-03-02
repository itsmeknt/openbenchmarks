import { notFound } from 'next/navigation'
import { getArtifactUrl } from '@/lib/s3'
import Link from 'next/link'

const CONTACT = process.env.CONTACT_EMAIL

const FIELDS = [
  'run_id', 'benchmark_id', 'model_id', 'quantization', 'score',
  'num_input_tokens', 'num_output_tokens', 'time_took', 'total_cost',
  'evaluator_id', 'date_evaluated', 'uploader_id', 'date_uploaded',
]

async function getRun(run_id: string) {
  // In production, fetch from your own API or directly from DB.
  // Doing direct DB access here to avoid HTTP round-trip on the server.
  const { connectDB } = await import('@/lib/mongodb')
  const { Run } = await import('@/models/Run')
  await connectDB()
  return Run.findOne({ run_id, status: 'complete' }).lean()
}

function fmtVal(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 6 })
  if (v instanceof Date || (typeof v === 'string' && /^\d{4}-/.test(v))) {
    return new Date(v).toLocaleString()
  }
  return String(v)
}

export default async function RunPage({ params }: { params: { run_id: string } }) {
  const run = await getRun(params.run_id) as any
  if (!run) notFound()

  const artifactUrl = run.artifact_key ? getArtifactUrl(run.artifact_key) : null

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to leaderboard
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
          Run Details
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {run.run_id}
        </p>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {FIELDS.map(field => (
              <tr key={field} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{
                  padding: '10px 16px',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  background: 'var(--surface-2)',
                  width: 200,
                  whiteSpace: 'nowrap',
                }}>
                  {field}
                </td>
                <td style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: 'var(--text)',
                }}>
                  {field === 'score' ? (
                    <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{fmtVal(run[field])}</span>
                  ) : fmtVal(run[field])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {artifactUrl && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono, monospace' }}>
            Artifact
          </p>
          <a
            href={artifactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
          >
            ↓ Download artifact
          </a>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 24 }}>
        If you see any errors with this run, please report them to{' '}
        <a href={`mailto:${CONTACT}`} style={{ color: 'var(--primary)' }}>{CONTACT}</a>.
      </p>
    </div>
  )
}
