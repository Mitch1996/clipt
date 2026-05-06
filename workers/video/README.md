# clipt-video-worker

FastAPI service that handles all heavy video work (ffmpeg, Whisper,
MediaPipe). Lives behind `VIDEO_WORKER_URL` and is invoked from the
Next.js side via the typed client at
`apps/web/src/lib/workers/videoWorker.ts`.

Today every endpoint is a **stub** — real implementations land in:

| Endpoint | Real impl prompt |
| --- | --- |
| `POST /jobs/transcribe` | 1.9 (faster-whisper) |
| `POST /jobs/reframe` | 1.10 (MediaPipe + ffmpeg) |
| `POST /jobs/download-youtube` | 2.0 (yt-dlp) |
| `GET  /healthz` | always real |

## Local dev

```bash
cd workers/video

# Use Python 3.12 (3.14 also works for the stubs but ML deps ship
# wheels for 3.10–3.12).
python -m venv .venv
. .venv/Scripts/activate              # PowerShell: . .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Generate a dev HMAC secret if you don't already have one in your
# .env. The Next side reads WORKER_HMAC_KEY from apps/web/.env.local;
# both sides must use the same value.
python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"

# Run.
WORKER_HMAC_KEY=<the-key> \
STORAGE_ENDPOINT_URL=https://<project>.supabase.co/storage/v1/s3 \
STORAGE_ACCESS_KEY_ID=<supabase-s3-access-key> \
STORAGE_SECRET_ACCESS_KEY=<supabase-s3-secret> \
STORAGE_BUCKET=clipt-media \
STORAGE_REGION=eu-west-1 \
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

You should see `INFO: Uvicorn running on http://0.0.0.0:8000`.

### Curl smoke

```bash
# Liveness — no auth.
curl http://localhost:8000/healthz
# {"status":"ok"}

# A signed job request. Generate the JWT with the same HMAC key
# used to start the worker.
TOKEN=$(node -e '
  const { SignJWT } = require("jose");
  const k = new TextEncoder().encode(process.env.WORKER_HMAC_KEY);
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("clipt-video-worker")
    .sign(k)
    .then((t) => process.stdout.write(t));
')

curl -X POST http://localhost:8000/jobs/transcribe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clipId":"smoke-test","sourceR2Key":"sources/smoke-test.mp4"}'
# {"captionsR2Key":"captions/smoke-test.json","language":"en", ...}
```

## Deploy to Fly

One-time setup (already done if `fly.toml` shows `app = "clipt-video-worker"`):

```bash
flyctl launch --no-deploy   # if you didn't already; reuses fly.toml
```

Set runtime secrets:

```bash
flyctl secrets set \
  WORKER_HMAC_KEY="$(node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")" \
  STORAGE_ENDPOINT_URL=https://<project>.supabase.co/storage/v1/s3 \
  STORAGE_ACCESS_KEY_ID=<...> \
  STORAGE_SECRET_ACCESS_KEY=<...> \
  STORAGE_BUCKET=clipt-media \
  STORAGE_REGION=eu-west-1
```

Then:

```bash
flyctl deploy
```

After the first deploy, copy the public URL into the Next app's
`apps/web/.env.local` as `VIDEO_WORKER_URL`, and copy the same
`WORKER_HMAC_KEY` value across so both sides sign with the same secret.
