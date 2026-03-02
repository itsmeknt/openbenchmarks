'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const EDITABLE_FIELDS = [
  { key: 'benchmark_id',      label: 'benchmark_id',      type: 'text',   required: true },
  { key: 'model_id',          label: 'model_id',           type: 'text',   required: true },
  { key: 'quantization',      label: 'quantization',       type: 'text',   required: false },
  { key: 'score',             label: 'score',              type: 'number', required: true },
  { key: 'num_input_tokens',  label: 'num_input_tokens',   type: 'number', required: false },
  { key: 'num_output_tokens', label: 'num_output_tokens',  type: 'number', required: false },
  { key: 'time_took',         label: 'time_took (sec)',    type: 'number', required: false },
  { key: 'total_cost',        label: 'total_cost (USD)',   type: 'number', required: false },
  { key: 'evaluator_id',      label: 'evaluator_id',       type: 'text',   required: false },
  { key: 'date_evaluated',    label: 'date_evaluated',     type: 'datetime-local', required: false },
]

function toDatetimeLocal(v: any): string {
  if (!v) return ''
  try { return new Date(v).toISOString().slice(0, 16) } catch { return '' }
}

function fmtDate(v: any): string {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString() } catch { return String(v) }
}

export default function MyUploadsClient() {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null) // run_id being edited
  const [editFields, setEditFields] = useState<Record<string, any>>({})
  const [newArtifact, setNewArtifact] = useState<File | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [saveMsg, setSaveMsg] = useState('')

  async function loadRuns() {
    setLoading(true)
    const res = await fetch('/api/my-uploads')
    const data = await res.json()
    setRuns(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { loadRuns() }, [])

  function startEdit(run: any) {
    setEditing(run.run_id)
    const f: Record<string, any> = {}
    for (const field of EDITABLE_FIELDS) {
      f[field.key] = field.type === 'datetime-local'
        ? toDatetimeLocal(run[field.key])
        : run[field.key] ?? ''
    }
    setEditFields(f)
    setNewArtifact(null)
    setSaveStatus('idle')
    setSaveMsg('')
  }

  function cancelEdit() {
    setEditing(null)
    setEditFields({})
  }

  function setField(key: string, value: any) {
    setEditFields(prev => ({ ...prev, [key]: value }))
  }

  async function saveEdit() {
    setSaveStatus('saving')
    setSaveMsg('Saving...')

    try {
      const payload: any = {
        run_id: editing,
        ...editFields,
        score: editFields.score ? Number(editFields.score) : undefined,
        num_input_tokens: editFields.num_input_tokens ? Number(editFields.num_input_tokens) : undefined,
        num_output_tokens: editFields.num_output_tokens ? Number(editFields.num_output_tokens) : undefined,
        time_took: editFields.time_took ? Number(editFields.time_took) : undefined,
        total_cost: editFields.total_cost ? Number(editFields.total_cost) : undefined,
        date_evaluated: editFields.date_evaluated ? new Date(editFields.date_evaluated).toISOString() : null,
      }

      if (newArtifact) {
        payload.refresh_artifact = true
        payload.artifact_content_type = newArtifact.type || 'application/octet-stream'
      }

      const res = await fetch('/api/my-uploads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      if (newArtifact && data.presigned_url) {
        setSaveMsg('Uploading artifact...')
        const s3Res = await fetch(data.presigned_url, {
          method: 'PUT',
          body: newArtifact,
          headers: { 'Content-Type': newArtifact.type || 'application/octet-stream' },
        })
        if (!s3Res.ok) throw new Error('S3 upload failed')

        // end-upload
        setSaveMsg('Finalizing...')
        const endRes = await fetch('/api/end-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: editing }),
        })
        if (!endRes.ok) throw new Error('Finalization failed')
      }

      setSaveStatus('done')
      setSaveMsg('Saved!')
      await loadRuns()
      setTimeout(() => { setEditing(null); setSaveStatus('idle') }, 1200)
    } catch (err: any) {
      setSaveStatus('error')
      setSaveMsg(err.message)
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading runs...</div>
  }

  if (runs.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 16px', fontSize: 14 }}>
          You haven&apos;t uploaded any runs yet.
        </p>
        <a href="/upload" className="btn btn-primary">Submit your first run</a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {runs.map(run => (
        <div key={run.run_id} className="card">
          {editing === run.run_id ? (
            /* Edit form */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                  Editing {run.run_id}
                </span>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={cancelEdit}>Cancel</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 16 }}>
                {EDITABLE_FIELDS.map(f => (
                  <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {f.label}{f.required && <span style={{ color: 'var(--primary)' }}> *</span>}
                    </span>
                    <input
                      className="field"
                      type={f.type}
                      step={f.type === 'number' ? 'any' : undefined}
                      value={editFields[f.key] ?? ''}
                      onChange={e => setField(f.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Replace artifact (optional)
                </p>
                <input type="file" onChange={e => setNewArtifact(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
              </div>

              {saveStatus === 'error' && (
                <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 8px' }}>⚠ {saveMsg}</p>
              )}
              {saveStatus === 'done' && (
                <p style={{ fontSize: 12, color: 'var(--green)', margin: '0 0 8px' }}>✓ {saveMsg}</p>
              )}

              <button
                className="btn btn-primary"
                onClick={saveEdit}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? saveMsg : 'Save changes'}
              </button>
            </div>
          ) : (
            /* Summary row */
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>RUN ID</p>
                  <Link href={`/run/${run.run_id}`} style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {run.run_id?.slice(0, 12)}…
                  </Link>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>MODEL</p>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{run.model_id}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>BENCHMARK</p>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{run.benchmark_id}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>SCORE</p>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--primary)' }}>{run.score}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>STATUS</p>
                  <span className={`badge badge-${run.status === 'complete' ? 'green' : 'gray'}`}>
                    {run.status}
                  </span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>UPLOADED</p>
                  <p style={{ margin: 0, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(run.date_uploaded)}</p>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap', fontSize: 12 }} onClick={() => startEdit(run)}>
                Edit
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
