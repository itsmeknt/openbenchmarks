import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Run } from '@/models/Run'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const benchmark_id = searchParams.get('benchmark_id')

  const query: any = { status: 'complete' }
  if (benchmark_id) query.benchmark_id = benchmark_id

  const runs = await Run.find(query).lean()
  return NextResponse.json(runs)
}
