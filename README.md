# CourseForge

Turn any educational YouTube video into a complete, structured course: modules, detailed lessons with step-by-step instructions, illustrations, quizzes, a final assessment, and a verifiable PDF certificate.

Two generation engines share one pipeline:

- **Built-in AI (background):** the server generates the course with Claude, using the operator's `ANTHROPIC_API_KEY`.
- **Bring your own AI (MCP):** learners connect **their own Claude or ChatGPT** as a custom connector. Their assistant writes the course using their subscription, so no AI key is needed on the server or from the user.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · Supabase (Postgres, Auth, Storage, RLS) · Claude (Anthropic SDK) · Zod · Framer Motion · Recharts · pdf-lib

---

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in the values (see below)
npx supabase link --project-ref <your-project-ref>
npx supabase db push              # applies supabase/migrations
npm run dev
```

Then sign up at `http://localhost:3000/signup`. To make yourself an admin, add your email to `ADMIN_EMAILS` (applied on your next verified sign-in), or run:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### Required configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Background jobs, grading, certificates |
| `ANTHROPIC_API_KEY` | Built-in AI engine. **Optional** if users generate with their own Claude/ChatGPT via MCP |
| `NEXT_PUBLIC_SITE_URL` | Public base URL (emails, QR codes, job self-calls) |
| `JOB_RUNNER_SECRET`, `CRON_SECRET` | Authenticate background slices and the recovery cron |

Recommended: `SUPADATA_API_KEY` (captions and transcription) and `YOUTUBE_API_KEY` (duration, description, caption availability). If a key is missing, the UI shows what is unavailable and why; it never fakes data. See [.env.example](.env.example) for everything.

### Supabase setup

1. **Auth → URL configuration:** set Site URL to `NEXT_PUBLIC_SITE_URL` and add `<site>/auth/callback` to the redirect URLs.
2. **Auth → Providers → Google:** enable it and add your Google OAuth client.
3. **Email templates** (optional): the default PKCE links work through `/auth/callback`. If you prefer token-hash links, point the templates at `/auth/confirm?token_hash={{ .TokenHash }}&type=email` (or `type=recovery&next=/reset-password`).
4. The migration creates the storage buckets: `illustrations` (public), `certificates` (private), and `uploads` (private, per-user folders).

---

## How generation works

Generation is a **durable, resumable background pipeline**. The browser can close at any point.

```
metadata → transcript → analyze (per chunk + per screenshot) → objectives → structure
        → lessons (per lesson) → illustrations (per lesson) → assessments (per module + final)
        → quality → save
```

- **State lives in Postgres.** Each stage is split into idempotent tasks (`job_tasks`), and every result is checkpointed. A job runs in bounded *slices* (`JOB_SLICE_SECONDS`). A slice takes an exclusive lease (`claim_job`), runs tasks in parallel, saves progress, and hands off to the next slice through `/api/jobs/run`.
- **Recovery.** `/api/cron/jobs` (every minute, see `vercel.json`) resumes any job whose slice crashed or timed out. The progress page also nudges a stalled job when it polls.
- **Retries.** Each task gets 3 attempts. Rate limits back off without using up an attempt. A failure in a critical stage fails the job with a clear message; **Retry** resumes from the last completed task.
- **Progress is real.** It is completed tasks ÷ tasks planned so far. Later stages add their tasks once the structure is known, and the UI says so.

### Completeness and honesty

- The **entire** transcript is split into time-bounded chunks, and every segment lands in exactly one chunk. Each chunk is mined for *every* teaching point (topic, concept, demonstration, step, example, warning), with timestamps and a visual-dependency flag.
- The curriculum must assign every teaching point to a lesson. Any point the model misses is assigned deterministically to the lesson nearest in time.
- Each lesson must report which assigned points it taught. If any are missing, the lesson is regenerated once; anything still missing is flagged on the lesson.
- The **quality stage** combines a programmatic coverage checklist with an AI review against 10 criteria. The course is marked `ready` or `needs_review`, and the course page shows a "How this course was made" report.
- Analysis is **transcript-based**, and the app says so. Learners or authors can upload screenshots of key moments. These are analysed with Claude vision and placed in the matching lessons. Lessons list "shown on screen" gaps and link to the exact timestamp.
- Supplementary examples are labelled separately from content taken from the video.

### Transcript sources

| Source | When |
| --- | --- |
| Video captions | Default (Supadata `mode=native`) |
| AI transcription | For videos without captions (Supadata `mode=generate`, user opts in) |
| Upload transcript | `.vtt`, `.srt`, YouTube "Show transcript" copy, or `[mm:ss]` text. Always available |
| Upload recording | For media the user owns; transcribed from a signed Storage URL |

---

## Bring your own AI (MCP)

The app exposes a remote MCP server at **`<NEXT_PUBLIC_SITE_URL>/api/mcp`**. It uses Streamable HTTP and is stateless, so all state lives in Postgres. It has its own OAuth 2.1 authorization server, which is what the Claude and ChatGPT custom connectors expect:

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource` | RFC 9728 resource metadata (advertised in the `401 WWW-Authenticate` header) |
| `/.well-known/oauth-authorization-server` | RFC 8414 metadata (also served at `/.well-known/openid-configuration`) |
| `/api/oauth/register` | Dynamic client registration (RFC 7591) |
| `/oauth/authorize` | Consent screen (requires a signed-in user) |
| `/api/oauth/token`, `/api/oauth/revoke` | Authorization code + PKCE (S256 only); rotating refresh tokens |

**User flow:** Dashboard → **Connect AI** shows the connector URL, step-by-step setup for Claude and ChatGPT, and the connected apps (each can be disconnected). The user either:

- says *"Create a course from <url>"* in their chat, or
- prepares a course on the web (choosing **"Your Claude or ChatGPT"**, which also allows transcript and screenshot uploads), then says *"continue my course"*.

**How it works:** the server still fetches metadata and the transcript. It then hands the assistant one task at a time through `get_next_step`, using the **same prompts** the built-in engine uses. Each `submit_*` tool validates the answer with the **same Zod schemas and `apply*` functions**, so the completeness rules are identical:

- A curriculum that leaves teaching points unassigned is rejected with the list of what's missing.
- A lesson that skips assigned points is rejected the same way.

After two rejected attempts, the submission is saved and flagged for review instead. Screenshots are sent to the assistant as images for analysis. Progress is checkpointed after every step, so a user can resume in any new chat, and the web progress page updates live.

**Tools:** `create_course`, `list_courses`, `get_next_step`, `submit_chunk_analysis`, `submit_frame_analysis`, `submit_course_overview`, `submit_curriculum`, `submit_lesson`, `submit_illustrations`, `submit_quiz`, `submit_quality_review`. There is also a `create_course` prompt.

**Trade-offs vs. the built-in engine:**

- Generation happens only while the user's chat is working, not in the background.
- Long videos take many tool calls, so the user may need to say "continue" in a new chat.
- Output quality depends on the model the user has selected.
- Generation counts against the user's plan limits.

**Features that still need a server-side AI key:**

- AI grading of written quiz answers (without a key, grading falls back to keyword matching).
- The "Regenerate lesson / illustrations" buttons in the web app.

`create_course` from chat needs `SUPADATA_API_KEY` for transcripts. Without it, users prepare the course on the web with an uploaded transcript.

## Security model

- **RLS on every table.** Users read only their own data plus public, ready courses. Admin-only tables (`job_tasks`, `job_logs`, `ai_usage`, `platform_settings`) are hidden from everyone else.
- **Column grants** limit what clients may update (for example, title and description but not `status`; `full_name` but not `role`). Quiz answers (`correct_answer`, `explanation`) are not selectable by clients. Grading happens on the server.
- Quiz attempts and certificates are written only by the server after it checks eligibility, so clients can't forge them.
- The service-role key and AI keys are used only in server code (`server-only` modules). Every server action and admin action re-checks the session.
- Public certificate verification shows only the certificate number, recipient name, course title and issue date.

- **MCP/OAuth:**
  - Client secrets, authorization codes and tokens are stored only as SHA-256 hashes.
  - Codes are single use and expire after 5 minutes. A replayed code revokes the tokens it already issued.
  - Access tokens last 1 hour. Refresh tokens last 30 days and rotate on every use.
  - Redirect URIs must match exactly and be https (or http on loopback addresses).
  - Every MCP tool checks that the course belongs to the token's user.
  - The OAuth tables are not readable by clients.

These rules were tested against a local Postgres. Users couldn't see others' private courses, escalate their role, read answers, or forge attempts or certificates, and job leases were exclusive.

---

## Routes

**Public:** `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/certificate/verify/[id]`, `/about`, `/help`, `/contact`, `/privacy`, `/terms`

**MCP / OAuth:** `/api/mcp`, `/oauth/authorize`, `/api/oauth/*`, `/.well-known/*`

**App:** `/dashboard/connect`, `/dashboard`, `/dashboard/courses`, `/dashboard/courses/new`, `/dashboard/courses/[courseId]`, `/dashboard/courses/[courseId]/edit`, `/dashboard/courses/[courseId]/learn`, `/dashboard/explore`, `/dashboard/certificates`, `/dashboard/community`, `/dashboard/settings`

**Admin:** `/admin`, `/admin/users`, `/admin/courses`, `/admin/jobs`, `/admin/certificates`, `/admin/settings`

## Project layout

```
src/
  app/                      routes (marketing, auth, dashboard/(shell|player), admin, api)
  components/               ui (shadcn), landing, dashboard, course, player, admin, shared
  lib/
    ai/                     provider interface + Claude implementation, prompts, Zod schemas, pricing
    jobs/                   stages, pipeline (task handlers), runner (leases, slices, retries)
    transcript/             parsing, normalisation, chunking, providers
    youtube/                URL parsing, metadata
    certificates/           PDF rendering, verification URLs
    actions/                server actions (courses, learning, certificates, profile, admin)
    data/                   RLS-scoped read models
supabase/migrations/        schema, RLS, storage, functions
```

## Deployment notes

- **Vercel:** the `/api/jobs/run` route declares `maxDuration = 800`. On plans with a lower limit, set `JOB_SLICE_SECONDS` well below that limit (for example, 90 with a 300 s cap). Per-minute crons need a paid plan. Otherwise, call `/api/cron/jobs` from any scheduler with `Authorization: Bearer $CRON_SECRET`.
- **Self-hosted (`next start`):** works as is. Without `JOB_RUNNER_SECRET`, slices run in-process.
- **Model and cost:** the default model is `claude-opus-5-5` at `medium` effort. Admins can change it in Admin → Settings. Token usage and estimated cost per operation appear on the admin overview.
