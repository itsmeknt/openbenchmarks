import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import { Run } from '@/models/Run'
import { createPresignedUploadUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    benchmark_id, model_id, quantization, score,
    num_input_tokens, num_output_tokens, time_took, total_cost,
    evaluator_id, date_evaluated, artifact_content_type,
  } = body

  if (!benchmark_id || !model_id || score == null) {
    return NextResponse.json({ error: 'benchmark_id, model_id, and score are required' }, { status: 400 })
  }

  await connectDB()

  const run_id = randomUUID()
  const artifact_key = `artifacts/${run_id}`

  const run = await Run.create({
    run_id,
    benchmark_id,
    model_id,
    quantization: quantization ?? '',
    score,
    num_input_tokens: num_input_tokens ?? 0,
    num_output_tokens: num_output_tokens ?? 0,
    time_took: time_took ?? 0,
    total_cost: total_cost ?? 0,
    evaluator_id: evaluator_id ?? '',
    date_evaluated: date_evaluated ? new Date(date_evaluated) : null,
    uploader_id: session.user.name ?? session.user.email ?? 'unknown',
    date_uploaded: new Date(),
    artifact_key,
    status: 'pending',
  })

  const { url: presigned_url } = await createPresignedUploadUrl(
    artifact_key,
    artifact_content_type ?? 'application/octet-stream'
  )

  return NextResponse.json({ run_id: run.run_id, presigned_url, artifact_key })
}
