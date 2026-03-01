# EvalHub

Community-powered LLM benchmark aggregator. Members run evals locally, upload scores and artifacts, and the site visualizes aggregated results.

## Stack

- **Next.js 14** (App Router) — frontend + API routes
- **Auth.js v5** — GitHub OAuth
- **MongoDB + Mongoose** — run metadata
- **AWS S3** — artifact storage (presigned uploads, client-side direct to S3)
- **Recharts** — charts
- **Vercel** — deployment target

## Setup

### 1. Clone & install

```bash
git clone <repo>
cd evalhub
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`:

| Variable | Description |
|----------|-------------|
| `DEFAULT_BENCHMARK_ID` | Benchmark shown by default on leaderboard (e.g. `mmlu`) |
| `CONTACT_EMAIL` | Email shown on run detail pages |
| `NEXTAUTH_SECRET` | Random secret — run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Full URL of your app (e.g. `https://evalhub.vercel.app`) |
| `GITHUB_CLIENT_ID` | From GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | From GitHub OAuth app |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `AWS_REGION` | e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` | IAM user with S3 access |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| `AWS_S3_BUCKET` | S3 bucket name |

### 3. GitHub OAuth App

1. Go to https://github.com/settings/developers → New OAuth App
2. Homepage URL: your app URL
3. Callback URL: `<your-url>/api/auth/callback/github`
4. Copy Client ID + Secret to `.env.local`

### 4. AWS S3 Setup

Create a bucket with this CORS config:

```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedOrigins": ["*"],
  "ExposeHeaders": []
}]
```

Create an IAM user with `s3:PutObject` and `s3:GetObject` on your bucket, use its credentials.

### 5. Run locally

```bash
npm run dev
```

## Deploy to Vercel

```bash
npx vercel
```

Add all environment variables in the Vercel dashboard (Project → Settings → Environment Variables).

## User Flows

### Guests (leaderboard)
- `/` — interactive leaderboard with chart + table
  - Filter by any attribute, choose X/Y axes, choose aggregate function (median/mean/stddev/min/max/quartile)
  - Quartile mode renders a box-and-whisker chart
  - Click any `run_id` to view run details

### Run detail
- `/run/[run_id]` — key/value table of all attributes + artifact download link

### Uploaders (requires GitHub sign-in)
- `/upload` — paste result JSON (auto-extracts fields), correct values, upload artifact, submit
- `/my-uploads` — list your runs, click Edit to update fields or re-upload artifact

## API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/runs` | GET | — | All complete runs (optional `?benchmark_id=` filter) |
| `/api/runs/[run_id]` | GET | — | Single run |
| `/api/begin-upload` | POST | ✓ | Create pending run, returns presigned S3 URL |
| `/api/end-upload` | POST | ✓ | Finalize run as complete |
| `/api/my-uploads` | GET | ✓ | Your runs |
| `/api/my-uploads` | PATCH | ✓ | Edit a run's fields or refresh artifact URL |

### Upload flow

```
POST /api/begin-upload  →  { run_id, presigned_url }
PUT <presigned_url>     →  (upload artifact directly from browser to S3)
POST /api/end-upload    →  { success: true }
```

## Data Model

```typescript
{
  run_id: string          // UUID, auto-generated
  benchmark_id: string    // e.g. "mmlu"
  model_id: string        // e.g. "llama-3-8b"
  quantization: string    // e.g. "q4_k_m"
  score: number           // 0–1 typically
  num_input_tokens: number
  num_output_tokens: number
  time_took: number       // seconds
  total_cost: number      // USD
  submitter_id: string    // who ran the eval
  date_submitted: Date    // when eval was run
  uploader_id: string     // GitHub username of uploader
  date_uploaded: Date
  artifact_key: string    // S3 key
  status: 'pending' | 'complete'
}
```
