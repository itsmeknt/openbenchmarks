'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, BoxPlot,
} from 'recharts'
import Link from 'next/link'

const ATTRIBUTES = [
  'benchmark_id', 'model_id', 'quantization', 'score',
  'num_input_tokens', 'num_output_tokens', 'time_took',
  'total_cost', 'run_id', 'evaluator_id', 'date_evaluated',
  'uploader_id', 'date_uploaded',
] as const

const NUMERIC_ATTRS = ['score', 'num_input_tokens', 'num_output_tokens', 'time_took', 'total_cost']

type Attr = typeof ATTRIBUTES[number]
type AggFn = 'median' | 'mean' | 'stddev' | 'min' | 'max' | 'quartile'
type FilterMode = 'include' | 'exclude'

interface Filter { mode: FilterMode; attr: Attr; value: string }
interface Run { [key: string]: any }

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}
function mean(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length }
function stddev(arr: number[]) {
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length)
}

function quartiles(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const q = (p: number) => {
    const idx = p * (s.length - 1)
    const lo = Math.floor(idx), hi = Math.ceil(idx)
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)
  }
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[s.length - 1] }
}

function aggregate(values: number[], fn: AggFn): number | object {
  if (!values.length) return 0
  switch (fn) {
    case 'median':  return median(values)
    case 'mean':    return mean(values)
    case 'stddev':  return stddev(values)
    case 'min':     return Math.min(...values)
    case 'max':     return Math.max(...values)
    case 'quartile': return quartiles(values)
    default:        return median(values)
  }
}

function fmtVal(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (v instanceof Date || (typeof v === 'string' && v.match(/^\d{4}-/))) {
    return new Date(v).toLocaleDateString()
  }
  return String(v)
}

const SORT_DIR = { asc: 1, desc: -1 } as const

export default function DataView({ defaultBenchmarkId }: { defaultBenchmarkId: string }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [xAxis, setXAxis] = useState<Attr>('model_id')
  const [yAxis, setYAxis] = useState<Attr>('score')
  const [aggFn, setAggFn] = useState<AggFn>('median')
  const [filters, setFilters] = useState<Filter[]>([
    { mode: 'include', attr: 'benchmark_id', value: defaultBenchmarkId }
  ])
  const [sortCol, setSortCol] = useState<string>('model_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  useEffect(() => {
    fetch('/api/runs')
      .then(r => r.json())
      .then(data => { setRuns(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Apply filters
  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      for (const f of filters) {
        const v = String(run[f.attr] ?? '')
        const match = v.toLowerCase() === f.value.toLowerCase()
        if (f.mode === 'include' && !match) return false
        if (f.mode === 'exclude' && match) return false
      }
      return true
    })
  }, [runs, filters])

  // Aggregate for chart
  const chartData = useMemo(() => {
    const groups = new Map<string, number[]>()
    for (const run of filteredRuns) {
      const key = `${run.model_id}__${run.quantization}`
      const yVal = run[yAxis]
      if (typeof yVal === 'number') {
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(yVal)
      }
    }

    return Array.from(groups.entries()).map(([key, values]) => {
      const [model_id, quantization] = key.split('__')
      const label = quantization ? `${model_id} (${quantization})` : model_id
      const agg = aggregate(values, aggFn)
      if (aggFn === 'quartile' && typeof agg === 'object') {
        const q = agg as any
        return { name: label, min: q.min, q1: q.q1, median: q.median, q3: q.q3, max: q.max }
      }
      return { name: label, value: agg as number }
    }).sort((a, b) => ((b as any).value ?? (b as any).median ?? 0) - ((a as any).value ?? (a as any).median ?? 0))
  }, [filteredRuns, yAxis, aggFn])

  // Sort for table
  const sortedRuns = useMemo(() => {
    return [...filteredRuns].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number') return (av - bv) * SORT_DIR[sortDir]
      return String(av).localeCompare(String(bv)) * SORT_DIR[sortDir]
    })
  }, [filteredRuns, sortCol, sortDir])

  const paginatedRuns = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return sortedRuns.slice(start, start + PAGE_SIZE)
  }, [sortedRuns, page])

  const totalPages = Math.max(1, Math.ceil(sortedRuns.length / PAGE_SIZE))

  function toggleSort(col: string) {
    if (sortCol === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function setDir(fn: (d: 'asc' | 'desc') => 'asc' | 'desc') {
    setSortDir(fn)
  }

  function addFilter() {
    setFilters(f => [...f, { mode: 'include', attr: 'benchmark_id', value: '' }])
  }

  function removeFilter(i: number) {
    setFilters(f => f.filter((_, idx) => idx !== i))
  }

  function updateFilter(i: number, patch: Partial<Filter>) {
    setFilters(f => f.map((fi, idx) => idx === i ? { ...fi, ...patch } : fi))
  }

  // Collect unique values per attribute for filter dropdowns
  const uniqueValues = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const attr of ATTRIBUTES) {
      map[attr] = new Set(runs.map(r => String(r[attr] ?? '')).filter(Boolean))
    }
    return map
  }, [runs])

  const isBoxPlot = aggFn === 'quartile'

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.03em' }}>
            Benchmark Leaderboard
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {loading ? 'Loading...' : `${filteredRuns.length.toLocaleString()} runs · ${sortedRuns.length !== runs.length ? `${runs.length.toLocaleString()} total` : ''}`}
          </p>
        </div>
        <a href="/upload" className="btn btn-primary">+ Submit Run</a>
      </div>

      {/* Chart controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            X axis
            <select className="field" style={{ marginLeft: 6 }} value={xAxis} onChange={e => setXAxis(e.target.value as Attr)}>
              {ATTRIBUTES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Y axis
            <select className="field" style={{ marginLeft: 6 }} value={yAxis} onChange={e => setYAxis(e.target.value as Attr)}>
              {NUMERIC_ATTRS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Aggregate
            <select className="field" style={{ marginLeft: 6 }} value={aggFn} onChange={e => setAggFn(e.target.value as AggFn)}>
              {(['median','mean','stddev','min','max','quartile'] as AggFn[]).map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {filters.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="field" style={{ fontSize: 12 }} value={f.mode} onChange={e => updateFilter(i, { mode: e.target.value as FilterMode })}>
                <option value="include">Only include</option>
                <option value="exclude">Exclude all</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>where</span>
              <select className="field" style={{ fontSize: 12 }} value={f.attr} onChange={e => updateFilter(i, { attr: e.target.value as Attr, value: '' })}>
                {ATTRIBUTES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>=</span>
              <input
                className="field"
                style={{ fontSize: 12, minWidth: 180 }}
                list={`values-${i}`}
                value={f.value}
                onChange={e => updateFilter(i, { value: e.target.value })}
                placeholder="value..."
              />
              <datalist id={`values-${i}`}>
                {[...uniqueValues[f.attr] ?? []].slice(0, 50).map(v => <option key={v} value={v} />)}
              </datalist>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => removeFilter(i)}>✕</button>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addFilter}>+ Add filter</button>

        {/* Chart */}
        <div style={{ marginTop: 20, height: 280 }}>
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading data...
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No data matches current filters
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {isBoxPlot ? (
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 60, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 11, fontFamily: 'JetBrains Mono' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#666', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 4, fontSize: 12 }} />
                  {/* Box whisker approximated with lines */}
                  <Line type="monotone" dataKey="min" stroke="#555" dot={false} strokeDasharray="2 2" />
                  <Line type="monotone" dataKey="q1" stroke="#f59e0b88" dot={false} />
                  <Line type="monotone" dataKey="median" stroke="#f59e0b" dot={{ r: 3 }} strokeWidth={2} />
                  <Line type="monotone" dataKey="q3" stroke="#f59e0b88" dot={false} />
                  <Line type="monotone" dataKey="max" stroke="#555" dot={false} strokeDasharray="2 2" />
                </ComposedChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 60, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 11, fontFamily: 'JetBrains Mono' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#666', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip
                    contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 4, fontSize: 12, fontFamily: 'JetBrains Mono' }}
                    formatter={(v: any) => [typeof v === 'number' ? v.toFixed(4) : v, yAxis]}
                  />
                  <Bar dataKey="value" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {ATTRIBUTES.map(col => (
                  <th
                    key={col}
                    className={sortCol === col ? 'sorted' : ''}
                    onClick={() => toggleSort(col)}
                  >
                    {col} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRuns.length === 0 && !loading && (
                <tr>
                  <td colSpan={ATTRIBUTES.length} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    {runs.length === 0 ? 'No runs yet. Be the first to submit!' : 'No runs match the current filters.'}
                  </td>
                </tr>
              )}
              {paginatedRuns.map((run, i) => (
                <tr key={run.run_id || i}>
                  {ATTRIBUTES.map(col => (
                    <td key={col}>
                      {col === 'run_id'
                        ? <Link href={`/run/${run.run_id}`}>{run.run_id?.slice(0, 8)}…</Link>
                        : fmtVal(run[col])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {sortedRuns.length.toLocaleString()} results · page {page}/{totalPages}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </div>
  )
}
