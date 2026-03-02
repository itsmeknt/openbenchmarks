import mongoose, { Schema, Document } from 'mongoose'

export interface IRun extends Document {
  run_id: string
  benchmark_id: string
  model_id: string
  quantization: string
  score: number
  num_input_tokens: number
  num_output_tokens: number
  time_took: number      // seconds
  total_cost: number     // USD
  evaluator_id: string   // GitHub username of person who ran the eval
  date_evaluated: Date   // when eval was run
  uploader_id: string    // GitHub user ID of uploader
  date_uploaded: Date
  artifact_key: string   // S3 key
  status: 'pending' | 'complete'
}

const RunSchema = new Schema<IRun>({
  run_id:           { type: String, required: true, unique: true },
  benchmark_id:     { type: String, required: true, index: true },
  model_id:         { type: String, required: true },
  quantization:     { type: String, default: '' },
  score:            { type: Number, required: true },
  num_input_tokens: { type: Number, default: 0 },
  num_output_tokens:{ type: Number, default: 0 },
  time_took:        { type: Number, default: 0 },
  total_cost:       { type: Number, default: 0 },
  evaluator_id:     { type: String, default: '' },
  date_evaluated:   { type: Date, default: null },
  uploader_id:      { type: String, required: true },
  date_uploaded:    { type: Date, default: Date.now },
  artifact_key:     { type: String, default: '' },
  status:           { type: String, enum: ['pending', 'complete'], default: 'pending' },
})

export const Run = mongoose.models.Run || mongoose.model<IRun>('Run', RunSchema)
