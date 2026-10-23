# ClipForge AI

AI-powered platform for turning long-form videos into short-form clips.

**Status: All 10 phases built.** Full pipeline — auth, upload,
transcription, AI clip detection, automatic vertical shorts with
face-tracked crop and burned-in captions, thumbnails, AI image/video
generation, an AI writing assistant, Stripe billing, an admin panel,
and security hardening. See "Honest limitations" near the bottom for
exactly what was verified in this build sandbox versus what needs your
own API keys/GPU/deployment to test.

## Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for local Postgres)

## Setup

```bash
# 1. Install JS dependencies (frontend + shared packages)
npm install

# 2. Copy env template and fill in Supabase keys
cp .env.example .env

# 3. Start local Postgres
docker compose up -d

# 4. Generate Prisma client and run the first migration
npm run db:generate
npm run db:migrate

# 5. Set up the Python backend
cd apps/api
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

## Supabase Auth setup (required for Phase 2)

Do these once in your Supabase project dashboard — no code needed:

1. **Authentication → URL Configuration**: set Site URL to
   `http://localhost:3000` and add `http://localhost:3000/auth/callback`
   to Redirect URLs.
2. **Authentication → Providers → Google**: toggle it on, add your
   Google OAuth Client ID/Secret (from Google Cloud Console →
   Credentials → OAuth 2.0 Client, with
   `https://<your-project>.supabase.co/auth/v1/callback` as the
   authorized redirect URI).
3. **Authentication → Email templates**: the default "Confirm signup"
   and "Reset password" templates already point at your Site URL — no
   change needed for local dev.

## Supabase Storage setup (required for Phase 3)

1. **Storage → New bucket**: create a bucket named `videos`, set it to
   **private** (not public) — signed URLs handle all access, so nothing
   needs to be publicly readable.
2. **Storage → Policies** on the `videos` bucket: you don't need to add
   RLS policies for user access, because all uploads/downloads go
   through signed URLs generated server-side with the service role key,
   which bypasses RLS by design. If you later add direct client-side
   Storage access anywhere, add a policy scoping `storage.objects` to
   `(storage.foldername(name))[1] = auth.uid()::text` so users can only
   touch their own folder.

Re-run the migration after pulling this phase, since a `Video` model
and `VideoStatus` enum were added:

```bash
npm run db:migrate
```

## Running locally

```bash
# Terminal 1 — frontend (http://localhost:3000)
npm run dev --workspace=apps/web

# Terminal 2 — backend (http://localhost:8000)
cd apps/api
source venv/bin/activate
uvicorn app.main:app --reload
```

## Testing this phase

1. **Create a project**: on `/dashboard`, type a name and click Create —
   should redirect to `/dashboard/projects/<id>`.
2. **Upload a real video**: click "Upload a video", pick an MP4/MOV/MKV/AVI
   file. Watch the progress bar move as it uploads directly to Supabase
   Storage (check your browser's Network tab — the PUT request goes to
   `supabase.co`, not to `localhost:3000`, confirming large files never
   pass through our own server).
3. **Wait for processing**: status should move UPLOADING → PROCESSING →
   READY (page auto-refreshes every 3s while pending). A READY video
   shows its real duration and resolution, extracted by ffprobe — not
   hardcoded.
4. **Verify in the database**: `npx prisma studio` → `videos` table
   should show your row with `status: READY`, real `durationSeconds`,
   `width`, `height`.
5. **Reject a bad file**: try uploading a `.txt` file renamed to `.mp4`
   — ffprobe should fail it and the row should show `status: FAILED`
   with a real error reason, not crash the app.
6. **Access control**: try visiting another account's
   `/dashboard/projects/<id>` URL directly — should 404, not show their
   videos.

If all six work, Phase 3 is complete.

## Phase 4: Transcription + AI clip detection

**Important limitation**: transcription uses `faster-whisper`, which
needs model weights downloaded from Hugging Face on first run and
benefits enormously from a GPU. This could not be executed in the build
sandbox (no network, no GPU) — the integration code matches
faster-whisper's real documented API, but test it for real on your
machine before trusting it.

The **clip-scoring algorithm** (`app/clip_detection.py`) has no such
limitation — it's pure heuristics over transcript timestamps and was
tested directly: 3 automated tests in `apps/api/tests/test_clip_detection.py`
verify a hook/emotion-rich segment outscores boring filler, empty
transcripts return no clips, and selected clips never overlap.

Setup:
```bash
cd apps/api
pip install -r requirements.txt  # now includes faster-whisper
```
First transcription run will download the Whisper model (a few hundred
MB to ~3GB depending on `WHISPER_MODEL_SIZE`) — expect that to be slow
once, then fast.

Testing this phase:
1. On a `READY` video's page, click **Detect clips**.
2. Status should move PROCESSING → READY (polls every 4s). This can
   take minutes on CPU for a long video — that's expected, not a bug.
3. You should see up to 5 scored clip candidates, each showing a
   transcript excerpt and hook/emotion/storytelling/viral/density
   sub-scores.
4. Run the clip-detection unit tests directly (pytest isn't installed
   in this environment, but you can add it — `pip install pytest`):
   ```bash
   cd apps/api && pytest tests/test_clip_detection.py -v
   ```

## Phase 5: Automatic short creation + captions

Real, tested pipeline: face detection (OpenCV Haar cascade) computes
where to center a 9:16 crop, word-level transcript timestamps become
burned-in karaoke-style captions (`.ass` subtitles), and ffmpeg does the
crop/scale/caption render in one pass. This was verified end-to-end in
the build sandbox against synthetic test videos — a real output MP4 was
rendered, confirmed to be exactly 1080×1920, and visually inspected to
show both the face-centered crop and burned-in captions working
together.

**Known simplification**: face position is averaged across sampled
frames into a single static crop for the whole clip, not tracked
per-frame. True dynamic tracking (the crop panning smoothly as a
speaker moves) is a reasonable upgrade once this baseline ships — flag
it if that's a priority before Phase 10.

Setup — create a second Storage bucket:
1. **Storage → New bucket**: create `shorts`, private, same reasoning
   as the `videos` bucket (signed URLs handle all access).

Re-run the migration — `Short` model and `ShortStatus` enum were added:
```bash
npm run db:migrate
```

Your ffmpeg build needs `libass` support for caption burn-in (check
with `ffmpeg -filters | grep ass` — if missing, reinstall ffmpeg with
`--enable-libass`, or on Ubuntu `apt install ffmpeg` already includes it).

Testing this phase:
1. After clip detection finishes, click **Create short** on any clip.
2. Status moves PROCESSING → READY (polls every 4s).
3. Click **Download short** and confirm: vertical 9:16 video, the
   speaker roughly centered, captions burned in at the bottom.
4. Try a clip from a video with no visible face — it should still
   render, just center-cropped instead of face-tracked (this is the
   documented fallback, not a failure).

## Phase 6: Thumbnails + AI image/video generation

Thumbnail generation (ffmpeg frame extraction + PIL text overlay) is
real and was tested end-to-end against a real video, including all 4
style presets. Background replacement and face enhancement are **not**
implemented — they need a segmentation model (e.g. rembg) and a
face-restoration model (e.g. GFPGAN) respectively, which need GPU
inference this sandbox doesn't have. `enhance_and_replace_background()`
in `app/thumbnails.py` is the documented extension point.

AI image/video generation calls Replicate's real API (hosts SDXL/FLUX
and CogVideoX without you self-hosting GPUs) — correct against
Replicate's documented request/response shapes, but **not executable
here** (no network, no `REPLICATE_API_TOKEN`). Get a token at
replicate.com, add it to `.env`, and test for real before shipping.

Setup:
1. **Storage → New buckets**: `thumbnails`, `generated-images`,
   `generated-videos` — all private, same signed-URL pattern as before.
2. Add to `.env`: `REPLICATE_API_TOKEN=` (get one at replicate.com).
3. `npm run db:migrate` — `Thumbnail`, `GeneratedImage`, `GeneratedVideo`
   models were added.

Testing this phase:
1. On a READY video, click **Generate thumbnail** — should produce a
   real styled image with text overlay (this part is fully verifiable
   without any API keys).
2. On `/dashboard/generate/image`, enter a prompt and generate — this
   part **requires** a real `REPLICATE_API_TOKEN` to succeed.
3. Same for `/dashboard/generate/video`.
4. Confirm credits deduct correctly (5 for images, 25 for videos) and
   refund on a setup failure (check `/dashboard` credits count).

## Phase 7: AI Assistant

Titles, hashtags, descriptions, social posts, hooks, CTAs, and script
rewrites — one Claude API integration with a distinct system prompt per
task type (so outputs actually sound different per task instead of one
generic prompt reused everywhere). **Not executable in this sandbox**
(no network, no key) but matches Anthropic's real `/v1/messages` API.

Setup: add `ANTHROPIC_API_KEY` to `.env`.

Testing: open any clip's card, pick a task from the dropdown next to
"Ask AI", click it, confirm real generated text appears (costs 1 credit,
refunded automatically if the call fails).

## Phase 8: Payments (Stripe)

Real Checkout session creation, a real webhook handler with signature
verification (critical — without it, anyone could POST a fake "upgraded"
event and grant themselves a free plan), and Customer Portal for
self-service cancellation.

Setup:
1. Create two Products in your Stripe dashboard (Pro, Business), each
   with a recurring Price — copy the Price IDs into `.env` as
   `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_BUSINESS`.
2. `stripe listen --forward-to localhost:3000/api/billing/webhook` for
   local testing — this prints a webhook signing secret, put it in
   `STRIPE_WEBHOOK_SECRET`.
3. Add `STRIPE_SECRET_KEY` (test mode key to start).

Testing this phase (needs real Stripe test-mode keys — not executable
in this build sandbox):
1. Click **Upgrade to Pro** on `/dashboard/billing` — should redirect to
   a real Stripe Checkout page.
2. Complete checkout with Stripe's test card `4242 4242 4242 4242`.
3. Confirm you land back on `/dashboard/billing` and your plan now
   shows Pro, with credits topped up.
4. Click **Manage billing** → should open the Stripe Customer Portal.
5. Cancel the subscription there → confirm the webhook downgrades you
   back to Free (`customer.subscription.deleted` handler).

## Phase 9: Admin Panel + Analytics

Real aggregate Prisma queries (user counts, plan distribution, AI usage
counts) — no mock numbers. Error logging writes to a real `ErrorLog`
table. Feature flags are a real toggle-backed table, not a hardcoded
list.

**Honest limitation**: live revenue and server/AI infrastructure metrics
need a Stripe reporting integration and a real monitoring stack
(Railway/Vercel dashboards, or an APM like Sentry) — those don't exist
until you deploy somewhere real. The admin page says this explicitly
rather than showing invented numbers.

Setup — grant yourself admin access (no UI for this yet, by design —
you don't want a self-service "become admin" button):
```sql
UPDATE users SET "isAdmin" = true WHERE email = 'you@example.com';
```

Testing: visit `/dashboard/admin` — as a non-admin it should 404 (not
reveal the route exists); as an admin, real counts should match what's
actually in your database.

## Phase 10: Security Hardening

What's implemented and where:

| Requirement | Where |
|---|---|
| JWT / session auth | Supabase Auth cookies, refreshed in `middleware.ts` |
| Rate limiting | `lib/rate-limit.ts` (Upstash) on all AI-generation/assistant routes |
| Input validation | Every route validates types/lengths before touching the DB |
| File validation | `packages/config/upload-limits.ts`, re-checked server-side |
| SQL injection protection | Prisma (parameterized) + asyncpg (parameterized `$1,$2`) — no string-built SQL anywhere |
| XSS protection | React escapes by default; no `dangerouslySetInnerHTML` used |
| CSRF | Supabase's SSR cookies are `SameSite=Lax` by default, which blocks cross-site POSTs from carrying the session |
| Encryption | TLS everywhere (Supabase, Stripe, Replicate, Anthropic all HTTPS-only); Supabase encrypts at rest |
| Secure internal API | FastAPI only accepts requests bearing `API_SECRET_KEY` — never exposed to browsers |

Setup: create a free Upstash Redis database, add
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` to `.env`. Without
these set, rate limiting **fails open** (logs nothing, blocks nothing) —
intentional so local dev isn't blocked, but make sure they're set before
production traffic.

Testing: hit `/api/generate/image` 11 times in under a minute — the
11th should return `429` with a `Retry-After` message, once Upstash is
configured.

## Deployment Guide

1. **Database**: create a Supabase project (or any managed Postgres),
   run `npm run db:migrate` against its connection string.
2. **Frontend (Vercel)**: import the repo, set the root directory to
   `apps/web`, add every env var from `.env.example` in Vercel's
   dashboard, deploy.
3. **Backend (Railway or Render)**: deploy `apps/api` as a Docker/Python
   service. Needs `ffmpeg` installed on the image (Railway's default
   Python buildpack does **not** include it — use a Dockerfile with
   `apt-get install -y ffmpeg`, or a base image that has it). Set
   `API_BASE_URL` on Vercel to this service's public URL.
4. **Stripe webhook**: point Stripe's webhook settings at
   `https://your-domain.com/api/billing/webhook` in live mode, and swap
   `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` for live-mode values.
5. **GPU for Whisper/generation** (optional but recommended): CPU
   transcription works but is slow for long videos — consider a GPU
   instance (Railway GPU, a Modal endpoint, or similar) once volume
   justifies it, and set `WHISPER_DEVICE=cuda`.

## Troubleshooting

- **"Module not found: @clipforge/db"** — run `npm install` from the
  repo root, not from `apps/web`; npm workspaces need the root install.
- **ffmpeg errors on the API service** — confirm `ffmpeg -version` and
  `ffmpeg -filters | grep ass` both work on that machine; captions need
  libass support specifically.
- **Signed URL upload fails with 400** — the `videos`/`shorts`/
  `thumbnails`/`generated-images`/`generated-videos` buckets must all
  exist and be private; a missing bucket is the most common cause.
- **Webhook signature verification fails** — you're likely using the
  wrong signing secret; `stripe listen` and the Stripe dashboard's
  configured webhook each have their *own* secret — don't mix them up.
- **Whisper is extremely slow** — expected on CPU for anything beyond
  short clips; this is exactly why `WHISPER_DEVICE=cuda` exists.

## Project Roadmap

- [x] Phase 1 — Repo foundation, DB schema, health-checked backend
- [x] Phase 2 — Auth (Supabase) + Dashboard shell
- [x] Phase 3 — Video import + storage
- [x] Phase 4 — Transcription + AI clip detection
- [x] Phase 5 — Automatic short creation (crop/face-track/captions)
- [x] Phase 6 — Thumbnail + image + video generation
- [x] Phase 7 — AI assistant (titles/hashtags/scripts)
- [x] Phase 8 — Payments (Stripe)
- [x] Phase 9 — Admin panel + analytics
- [x] Phase 10 — Security hardening + deployment

All 10 phases are built. See "Honest limitations" below for what
genuinely needs your own credentials/GPU/deployment to verify versus
what was tested directly in the build sandbox.

## Honest limitations — read this before assuming everything "just works"

Real, tested-in-sandbox with actual assertions or visual verification:
- ffprobe metadata extraction (Phase 3) — tested against a real
  generated video and a real corrupt file.
- Clip-detection scoring (Phase 4) — 3 automated tests pass, verifying
  hook/emotion content outranks filler and clips never overlap.
- Face detection + crop math (Phase 5) — tested against both a no-face
  and a real-detected-face synthetic video; crop correctly follows the
  detected position.
- ASS caption generation + ffmpeg render pipeline (Phase 5) — a real
  1080×1920 MP4 was rendered and visually confirmed to show both the
  crop and burned-in captions.
- Thumbnail generation (Phase 6) — all 4 style presets rendered and
  visually confirmed against a real extracted frame.

Written correctly against real documented APIs, but NOT executable in
this sandbox (no network access, no GPU, no API keys) — verify these
yourself before depending on them in production:
- faster-whisper transcription (needs model download + ideally GPU)
- Replicate image/video generation (needs `REPLICATE_API_TOKEN` + network)
- Anthropic assistant calls (needs `ANTHROPIC_API_KEY` + network)
- Stripe checkout/webhook/portal (needs real Stripe test/live keys)
- Upstash rate limiting (needs a real Upstash database)
- Everything about actual production deployment (Vercel/Railway/Render)

Not implemented — documented as an extension point, not silently
missing:
- Background replacement / face enhancement for thumbnails (needs a
  segmentation model + a face-restoration model — see
  `enhance_and_replace_background()` in `apps/api/app/thumbnails.py`)
- Per-frame dynamic face tracking for shorts (current version uses one
  averaged crop position for the whole clip, not a moving crop)
- YouTube URL import (the spec required rights-confirmation before
  building this — flag if you want it added with that gate in place)
