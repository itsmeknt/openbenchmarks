import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Run } from '@/models/Run'

export async function GET(_: NextRequest, { params }: { params: { run_id: string } }) {
  await connectDB()
  const run = await Run.findOne({ run_id: params.run_id, status: 'complete' }).lean()
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(run)
}
