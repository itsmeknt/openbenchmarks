import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import { Run } from '@/models/Run'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { run_id } = await req.json()
  if (!run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  await connectDB()

  const uploader_id = session.user.name ?? session.user.email ?? 'unknown'
  const run = await Run.findOneAndUpdate(
    { run_id, uploader_id, status: 'pending' },
    { status: 'complete' },
    { new: true }
  )

  if (!run) return NextResponse.json({ error: 'Run not found or not authorized' }, { status: 404 })

  return NextResponse.json({ success: true, run_id })
}
