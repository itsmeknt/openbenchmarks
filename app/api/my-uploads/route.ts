import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import { Run } from '@/models/Run'
import { createPresignedUploadUrl } from '@/lib/s3'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const uploader_id = session.user.name ?? session.user.email ?? 'unknown'
  const runs = await Run.find({ uploader_id }).sort({ date_uploaded: -1 }).lean()
  return NextResponse.json(runs)
}

// PATCH to update a run's fields or refresh presigned URL
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const uploader_id = session.user.name ?? session.user.email ?? 'unknown'
  const body = await req.json()
  const { run_id, refresh_artifact, artifact_content_type, ...updates } = body

  if (!run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  // Whitelist updatable fields
  const allowed = ['benchmark_id','model_id','quantization','score','num_input_tokens',
    'num_output_tokens','time_took','total_cost','evaluator_id','date_evaluated']
  const safeUpdates: any = {}
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key]
  }

  const run = await Run.findOneAndUpdate(
    { run_id, uploader_id },
    safeUpdates,
    { new: true }
  )
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let presigned_url: string | null = null
  if (refresh_artifact) {
    const result = await createPresignedUploadUrl(
      run.artifact_key,
      artifact_content_type ?? 'application/octet-stream'
    )
    presigned_url = result.url
    // Mark back to pending until end-upload is called
    await Run.updateOne({ run_id }, { status: 'pending' })
  }

  return NextResponse.json({ success: true, run, presigned_url })
}
