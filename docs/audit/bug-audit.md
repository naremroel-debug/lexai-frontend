# Bug Audit — LexAI
**Date:** 2026-04-04

## Frontend Build Results

> To be filled after running `npm run build` (Task 5)

## Rust Build Results

> To be filled after running `cargo check` (Task 5)

## Backend Build Results

> To be filled after running `npm run build` in backend (Task 5)

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

### CORS: Zero Headers on All Routes
**Every** backend route returns `NextResponse.json()` without CORS headers.
Tauri app requests from `tauri://localhost` or `http://localhost:8080` will be blocked.

**Fix needed:** Add CORS middleware or per-route headers:
```typescript
const headers = {
  'Access-Control-Allow-Origin': 'tauri://localhost',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

### Ollama Dependency
`/api/corpus/search` in `hybrid` and `semantic` modes requires Ollama running on `localhost:11434` with `nomic-embed-text` model.
- Falls back to keyword-only search if Ollama unavailable
- Desktop users would need Ollama installed for full corpus search
- **Decision needed:** Require Ollama, move embeddings to Vercel, or keep keyword-only?

## Priority Classification

### P0 Blockers (Must fix before P1)
1. CORS headers on all Vercel routes Tauri calls
2. Frontend Supabase anon key placeholder
3. Google OAuth credential placeholders in Rust

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
