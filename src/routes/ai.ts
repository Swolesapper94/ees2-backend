// DEPRECATED — this route is unreachable and unused (2026-07-03 MVP audit).
//
// It was a fully duplicate AI bullet-generation pipeline (OpenAI-backed, no
// regulation grounding, wrote to the now-removed `AiGeneration` model) that
// the frontend never called — confirmed via a repo-wide grep for its two
// endpoints (`/ai/generate-bullets`, `/ai/refine-bullet`) before removal.
//
// The real, live pipeline is `src/lib/ai/support-form-pipeline.ts` (OpenAI,
// regulation-RAG-grounded, writes to `AIBulletSuggestion` so output actually
// enters the accept/edit/reject review flow). Do not resurrect this file —
// extend the real pipeline instead. This file is no longer mounted in
// `src/routes/index.ts` and is safe to delete (`rm src/routes/ai.ts`).
import { Router } from "express";

export const aiRouter = Router();

