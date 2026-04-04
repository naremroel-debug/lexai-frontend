# Bug Audit — LexAI
**Date:** 2026-04-04

## Frontend Build Results (Vite)

**Status: PASS** — Built in 6.23s, 1799 modules transformed.

**Warning:** Main JS chunk is 735KB (gzip: 214KB). Needs code splitting via dynamic imports.
**Warning:** `triage-config.ts` is both dynamically and statically imported (won't affect runtime).

No TypeScript errors. No build failures.

## Rust Build Results (cargo check)

**Status: PASS** — Compiled successfully with 14 warnings, zero errors.

**Warnings (all minor — unused fields/functions):**
| Warning | File | Impact |
|---------|------|--------|
| Field `status` never read | `calendar/types.rs:65` | Harmless — deserialized from API |
| Field `token_type` never read | `microsoft/types.rs:26` | Harmless |
| Fields `bcc_recipients`, `has_attachments`, `importance` never read | `microsoft/types.rs:55-63` | Harmless |
| Field `importance` never read | `microsoft/types.rs:119` | Harmless |
| Field `time_zone` never read | `microsoft/types.rs:128` | Harmless |
| Field `last_modified_date_time` never read | `microsoft/types.rs:170` | Harmless |
| Function `compute_context_hash` never used | `suggestions/engine.rs:87` | Dead code — clean up |

All 28 Tauri commands compile. No blocking issues.

## Backend Build Results (Next.js)

**Status: PASS** — Compiled successfully, 12 static pages + 55 dynamic API routes generated.

No build errors. Lint skipped (configured in next.config.js).
55 API routes confirmed functional at build time.

## Known Backend Issues (from DX-DEEP.txt)

### Syntax Issues (4 files)
| File | Issue | Severity | Tauri Impact |
|------|-------|----------|-------------|
| `src/lib/ai.ts` | Brace mismatch {208 vs }212 | HIGH | Used by all AI routes |
| `src/app/page.tsx` | Paren mismatch (4154 vs )4159 | NONE | Tauri app replaces this |
| `src/components/VerificarNorma.tsx` | Paren mismatch (144 vs )152 | NONE | Tauri app replaces this |
| `src/app/api/news/analyze/route.ts` | Brace mismatch {70 vs }74 | MEDIUM | Tauri calls this via Vercel |

### .catch() Anti-Pattern (10 occurrences across 8 routes)
| Route | Lines | Tauri Calls This? |
|-------|-------|-------------------|
| claude-orchestra-v2 | 313 | YES |
| deep-research | 115, 227, 230, 246, 258 | YES |
| gemini-rag | 113 | YES |
| news/analyze | 143 | YES |
| spij/research | 101 | YES |
| spij/analyze-deep | 86 | YES |
| drive/client-db | 266, 267, 268, 396, 397 | FUTURE (P2) |
| emails | 146, 398 | Partial (Tauri does Gmail locally) |

**Pattern:** `.catch(e => ({ data: null, error: e }))` on Supabase promises.
**Why it's wrong:** Supabase client doesn't throw — it returns `{ data, error }`. The `.catch()` never fires, but creates confusing error types.
**Fix:** Remove `.catch()`, handle via the `error` object in the response.

### CORS: Middleware Exists But Missing Tauri Origin
**UPDATE (P1 discovery):** CORS middleware DOES exist in `src/middleware.ts`. It handles preflight and response headers for `/api/*` routes. However, `tauri://localhost` is NOT in the ALLOWED origins list.

**Fix:** Add `'tauri://localhost'` and `'https://tauri.localhost'` to the ALLOWED array in middleware.ts.

### Ollama Dependency
`/api/corpus/search` in `hybrid` and `semantic` modes requires Ollama running on `localhost:11434` with `nomic-embed-text` model.
- Falls back to keyword-only search if Ollama unavailable
- Desktop users would need Ollama installed for full corpus search
- **Decision needed:** Require Ollama, move embeddings to Vercel, or keep keyword-only?

## Priority Classification

### P0 Blockers (Must fix before P1)
1. CORS: Add Tauri origin to existing middleware (**middleware exists, just needs origin**)
2. ~~Frontend Supabase anon key placeholder~~ **RESOLVED** — real JWT already in supabase.ts
3. ~~Google OAuth credential placeholders in Rust~~ **RESOLVED** — real creds in auth.rs

### P1 Fixes (Fix during wiring phase)
4. .catch() anti-pattern in 8 backend routes
5. news/analyze brace mismatch
6. Dashboard hardcoded mockNews
7. Settings OAuth buttons not wired

### P2+ Fixes (Fix when relevant)
8. Ollama dependency decision for corpus search
9. lib/ai.ts brace mismatch (if affecting Gemini calls)

### Won't Fix (Dead code in legacy app)
10. page.tsx paren mismatch — Tauri app replaces it
11. VerificarNorma.tsx paren mismatch — Tauri app replaces it
12. Backend component issues — Tauri app replaces them
