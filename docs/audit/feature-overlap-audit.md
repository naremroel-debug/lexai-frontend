# Feature Overlap Audit — LexAI
**Date:** 2026-04-04

## 1. Search & Research Consolidation

### Current State: 5 overlapping search endpoints

| Endpoint | Purpose | Provider | Auth | Unique Value |
|----------|---------|----------|------|-------------|
| `/api/gemini-rag` | User's uploaded docs | Gemini | Yes | Personal document Q&A |
| `/api/corpus/search` | 598-PDF legal corpus | Ollama (local) | No | Offline-capable, free |
| `/api/spij/query` | SPIJ norms (non-streaming) | Gemini + Google Search | No | Government source data |
| `/api/spij/chat` | SPIJ norms (streaming) | Gemini + Google Search | No | Real-time streaming UX |
| `/api/spij/research` | Verified research | Gemini + Google Search | Yes | Confidence scores |

### Recommendation: Merge into 2 endpoints

1. **Legal Search** — Combines corpus/search + spij/query + spij/chat
   - One input, user picks source: "Mis Documentos" / "Corpus Legal" / "SPIJ"
   - Streaming by default, fallback to non-streaming
   - Corpus uses local Ollama, SPIJ uses Gemini + Google Search

2. **Verified Research** — Combines spij/research + spij/analyze-deep
   - Deep analysis with verification
   - Keeps the 10-method interpretation + confidence scoring

3. **Keep separate:** gemini-rag (personal docs are fundamentally different from legal corpus)

### What to cut
- `/api/spij/query` — Redundant with `/api/spij/chat` (same data, less capable)
- `/api/claude-orchestra` (v1) — Superseded by v2 with harness

## 2. AI Orchestration

### Current State: v1 and v2 coexist
- v1: Basic tool orchestration (26.8KB)
- v2: Same + circuit breaker + citation verification + hallucination check (15.6KB)

### Recommendation: Delete v1, use v2 exclusively
- v2 is strictly superior
- Frontend already points to v2 in api.ts

## 3. Google + Microsoft Dual Support

### Current State: 28 Rust commands
- 13 Google commands (Gmail + Calendar + Tasks + suggestions)
- 14 Microsoft commands (Outlook + MS Calendar + MS ToDo + auth)
- 1 AI suggestions command

### Recommendation: Keep both
- Both are fully built and working
- Microsoft support is a competitive advantage (many Peruvian law firms use Office 365)
- Settings page already has toggle for both providers
- No additional work needed — just wire the UI buttons

## 4. Dead Code

| Item | Location | Action |
|------|----------|--------|
| OpenAI SDK | Backend `package.json` + `src/lib/openai.ts` | Remove — Gemini + Claude have taken over |
| Claude Orchestra v1 | Backend `/api/claude-orchestra/` | Remove — v2 supersedes |
| Legacy `page.tsx` | Backend `src/app/page.tsx` (4,000 lines) | Do NOT fix — Tauri app replaces it |
| Backend components | Backend `src/components/*.tsx` | Do NOT fix — Tauri app replaces them |
| `PATCH-ALL.js` | Frontend root | Investigate — likely a one-time migration script |

## 5. Time Tracking (Cut)

| Item | Location | Action |
|------|----------|--------|
| Time entries API | Backend `/api/time-entries/` | Remove from Tauri app scope |
| mockTimeEntries | Frontend `mockData.ts` | Remove |
| Time logging widget | Frontend `Index.tsx` | Remove from Dashboard |
| TimeManagerV2 component | Backend `src/components/` | Already dead (backend component) |
| Load prediction API | Backend `/api/load-prediction/` | Remove from Tauri app scope |
| Weekly reports API | Backend `/api/reports/weekly/` | Remove from Tauri app scope |
