import DataView from '@/components/DataView'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const defaultBenchmark = process.env.DEFAULT_BENCHMARK_ID ?? 'mmlu'
  return <DataView defaultBenchmarkId={defaultBenchmark} />
}
