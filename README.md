# EES 2.0 — Backend

Express + TypeScript API for EES 2.0. Owns the database (Prisma/Postgres),
Supabase auth verification, Claude bullet generation, the consistency check,
and NCOER PDF generation.

## Stack

- Express 4 + TypeScript
- Prisma 6 (PostgreSQL via Supabase)
- `@supabase/supabase-js` (server-side token verification, service role)
- `@anthropic-ai/sdk` (Claude)
- `@react-pdf/renderer` (DA form PDF output)
- Zod (request validation)

## Setup

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, SUPABASE_*, ANTHROPIC_API_KEY
npm run prisma:generate
npm run prisma:push           # push schema to your Supabase DB
npm run seed                  # optional demo data
npm run dev                   # http://localhost:4000
```

## Environment

See [.env.example](.env.example). The frontend origin must be listed in
`CORS_ORIGIN`.

## API surface

All routes are mounted under `/api` and (except `/api/health`) require a
Supabase bearer token: `Authorization: Bearer <access_token>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/users` `/api/users/me` | admin list / current user |
| POST | `/api/users` | admin create |
| GET/POST | `/api/units` | unit hierarchy |
| GET/POST | `/api/rating-chains` | rating chains |
| GET/POST | `/api/support-forms` | continuous performance log |
| POST | `/api/support-forms/:id/entries` | log an entry |
| GET/POST | `/api/evaluations` | NCOERs |
| PATCH | `/api/evaluations/:id/sections/:section` | rating + bullets |
| POST | `/api/evaluations/:id/consistency-check` | pre-submission flags |
| POST | `/api/evaluations/:id/sign` | parallel signing |
| POST | `/api/ai/generate-bullets` | Claude generation (audited) |
| POST | `/api/ai/refine-bullet` | single-bullet refinement |
| GET | `/api/pdf/evaluations/:id` | download NCOER PDF |

## Anti-autopilot design

The AI is a coach, not a ghostwriter. Generation requires guided rater
responses, every generation is persisted in `AiGeneration`, and bullets carry
a source (`HUMAN` / `AI_MODIFIED` / `AI_UNMODIFIED`). See `start.md` §6.
