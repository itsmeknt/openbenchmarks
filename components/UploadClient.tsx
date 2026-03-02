'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const FIELDS = [
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

// Recursively try to extract known field values from a JSON blob
function autoExtract(json: any): Record<string, any> {
  const result: Record<string, any> = {}
  if (!json || typeof json !== 'object') return result

  const keyMap: Record<string, string[]> = {
    benchmark_id:       ['benchmark_id', 'benchmark', 'eval_id', 'eval'],
    model_id:           ['model_id', 'model', 'model_name'],
    quantization:       ['quantization', 'quant', 'bits'],
    score:              ['score', 'accuracy', 'acc', 'result'],
    num_input_tokens:   ['num_input_tokens', 'input_tokens', 'prompt_tokens'],
    num_output_tokens:  ['num_output_tokens', 'output_tokens', 'completion_tokens'],
    time_took:          ['time_took', 'time', 'duration', 'elapsed'],
    total_cost:         ['total_cost', 'cost', 'price'],
    evaluator_id:       ['evaluator_id', 'evaluator', 'author', 'username'],
    date_evaluated:     ['date_evaluated', 'date', 'timestamp', 'created_at'],
  }

  function search(obj: any) {
    if (!obj || typeof obj !== 'object') return
    for (const [field, aliases] of Object.entries(keyMap)) {
      if (result[field] != null) continue
      for (const alias of aliases) {
        if (obj[alias] != null) {
          result[field] = obj[alias]
          break
        }
      }
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) search(val)
    }
  }

  search(json)
  return result
}

function toDatetimeLocal(v: any): string {
  if (!v) return ''
  try {
    const d = new Date(v)
    return d.toISOString().slice(0, 16)
  } catch { return '' }
}

export default function UploadClient() {
  const router = useRouter()
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [fields, setFields] = useState<Record<string, any>>({})
  const [artifact, setArtifact] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [evaluatedRunId, setSubmittedRunId] = useState('')

  function handleJsonChange(text: string) {
    setJsonText(text)
    setJsonError('')
    if (!text.trim()) { setFields({}); return }
    try {
      const parsed = JSON.parse(text)
      const extracted = autoExtract(parsed)
      setFields(prev => {
        // Extracted values fill in, but don't overwrite manual user edits
        const merged: Record<string, any> = { ...extracted }
        // Convert date
        if (merged.date_evaluated) merged.date_evaluated = toDatetimeLocal(merged.date_evaluated)
        return merged
      })
    } catch {
      setJsonError('Invalid JSON')
    }
  }

  function setField(key: string, value: any) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    // Validate required fields
    for (const f of FIELDS) {
      if (f.required && !fields[f.key]) {
        setStatus('error')
        setStatusMsg(`${f.key} is required`)
        return
      }
    }

    setStatus('uploading')
    setStatusMsg('Registering run...')

    try {
      // Step 1: begin-upload
      const payload = {
        ...fields,
        score: Number(fields.score),
        num_input_tokens: fields.num_input_tokens ? Number(fields.num_input_tokens) : 0,
        num_output_tokens: fields.num_output_tokens ? Number(fields.num_output_tokens) : 0,
        time_took: fields.time_took ? Number(fields.time_took) : 0,
        total_cost: fields.total_cost ? Number(fields.total_cost) : 0,
        date_evaluated: fields.date_evaluated ? new Date(fields.date_evaluated).toISOString() : null,
        artifact_content_type: artifact?.type || 'application/octet-stream',
      }

      const beginRes = await fetch('/api/begin-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const begin = await beginRes.json()
      if (!beginRes.ok) throw new Error(begin.error || 'begin-upload failed')

      const { run_id, presigned_url } = begin

      // Step 2: upload artifact to S3
      if (artifact && presigned_url) {
        setStatusMsg('Uploading artifact to S3...')
        const uploadRes = await fetch(presigned_url, {
          method: 'PUT',
          body: artifact,
          headers: { 'Content-Type': artifact.type || 'application/octet-stream' },
        })
        if (!uploadRes.ok) throw new Error('S3 upload failed')
      }

      // Step 3: end-upload
      setStatusMsg('Finalizing...')
      const endRes = await fetch('/api/end-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id }),
      })
      const end = await endRes.json()
      if (!endRes.ok) throw new Error(end.error || 'end-upload failed')

      setStatus('done')
      setSubmittedRunId(run_id)
      setStatusMsg('Run evaluated successfully!')
    } catch (err: any) {
      setStatus('error')
      setStatusMsg(err.message || 'Upload failed')
    }
  }

  if (status === 'done') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: 'var(--green)' }}>Submitted!</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Your run has been evaluated successfully.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <a href={`/run/${evaluatedRunId}`} className="btn btn-primary">View run</a>
          <button className="btn btn-ghost" onClick={() => { setStatus('idle'); setFields({}); setJsonText(''); setArtifact(null) }}>
            Submit another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* JSON paste area */}
      <div className="card">
        <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono, monospace', display: 'block', marginBottom: 8 }}>
          Paste result JSON (optional — for auto-extraction)
        </label>
        <textarea
          className="field"
          style={{ width: '100%', height: 140, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.5 }}
          placeholder={'{\n  "benchmark_id": "mmlu",\n  "model_id": "llama-3-8b",\n  "score": 0.68,\n  ...\n}'}
          value={jsonText}
          onChange={e => handleJsonChange(e.target.value)}
        />
        {jsonError && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--red)' }}>{jsonError}</p>}
      </div>

      {/* Fields */}
      <div className="card">
        <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono, monospace' }}>
          Run fields
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
          {FIELDS.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                {f.label}{f.required && <span style={{ color: 'var(--primary)' }}> *</span>}
              </span>
              <input
                className="field"
                type={f.type}
                step={f.type === 'number' ? 'any' : undefined}
                value={fields[f.key] ?? ''}
                onChange={e => setField(f.key, e.target.value)}
                placeholder={f.required ? 'required' : 'optional'}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Artifact upload */}
      <div className="card">
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono, monospace' }}>
          Artifact (eval output file)
        </p>
        <input
          type="file"
          onChange={e => setArtifact(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13, color: 'var(--text-muted)' }}
        />
        {artifact && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {artifact.name} · {(artifact.size / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      {/* Submit */}
      {status === 'error' && (
        <p style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>⚠ {statusMsg}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={status === 'uploading'}
        >
          {status === 'uploading' ? statusMsg : 'Submit run'}
        </button>
        {status === 'uploading' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{statusMsg}</span>
        )}
      </div>
    </div>
  )
}
