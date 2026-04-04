# Simplification Decisions — LexAI
**Date:** 2026-04-04

## Final Page Structure

### Keep (8 pages)
| Page | Route | Purpose |
|------|-------|---------|
| Login | `/login` | Supabase email/password auth |
| Dashboard | `/` | KPIs, tasks, suggestions, news preview |
| Correos | `/correos` | Email list, triage, sync (Gmail or Outlook) |
| IA Legal | `/ia-legal` | AI chat, legal search, corpus, verified research |
| Casos | `/casos` | Case CRM with timeline, journal, Drive docs |
| Calendario | `/calendario` | Week/month view, deadlines, business days |
| Noticias | `/noticias` | El Peruano feed with AI analysis |
| Configuracion | `/configuracion` | OAuth connections, profile, triage settings |

### Removed
| Page/Feature | Reason |
|-------------|--------|
| Time tracking widget (Dashboard) | Cut per design spec |
| Document upload (Cases) | Replaced by Drive integration (P2) |
| Load prediction | Cut per design spec |
| Weekly reports | Cut per design spec |

## Backend API: What Tauri Calls

### AI Endpoints (via Vercel)
| Endpoint | Tauri Calls? | Action |
|----------|-------------|--------|
| `/api/claude-orchestra-v2` | YES | Keep — primary AI orchestrator |
| `/api/claude-orchestra` (v1) | NO | Delete — superseded by v2 |
| `/api/gemini-rag` | YES | Keep — personal document Q&A |
| `/api/deep-research` | YES | Keep — cross-source research |
| `/api/corpus/search` | YES | Keep — legal corpus (keyword fallback if no Ollama) |
| `/api/spij/chat` | YES | Keep — streaming legal norms chat |
| `/api/spij/research` | YES | Keep — verified research with confidence |
| `/api/spij/analyze-deep` | YES | Keep — deep legal interpretation |
| `/api/spij/query` | NO | Cut — redundant with spij/chat |
| `/api/verify-norm` | YES | Keep — 3-phase norm verification |
| `/api/news` | YES | Keep — news feed |
| `/api/news/analyze` | YES | Keep — per-article AI analysis |

### Data Endpoints (via Supabase direct)
| Endpoint | Action |
|----------|--------|
| `/api/dashboard` | Keep — aggregated dashboard data |
| `/api/cases` | Keep |
| `/api/client-journal` | Keep |
| `/api/emails` | Keep |
| `/api/calendar-events` | Keep |
| `/api/triage-config` | Keep |
| `/api/suggestions` | Keep |

### Endpoints Tauri Does NOT Call
| Endpoint | Action |
|----------|--------|
| `/api/time-entries` | Remove from frontend |
| `/api/load-prediction` | Remove from frontend |
| `/api/reports/weekly` | Remove from frontend |
| `/api/tasks` | Evaluate — may use for Google Tasks/MS ToDo sync |
| All `/api/auth/*` | Gmail/Calendar auth handled by Tauri Rust directly |
| `/api/drive/*` | Evaluate for P2 — Drive ops may go through Tauri Rust |

## IA Legal Page Simplification

### Current: 3 tabs + corpus search + quick actions
### Proposed: Unified search with mode selector

```
[ Input field                                          ]
[ Mode: Consulta | Busqueda | Investigacion | Corpus  ]
[ Results area with streaming markdown                 ]
```

- **Consulta** → claude-orchestra-v2 (tool orchestration, citations, verification)
- **Busqueda** → spij/chat (streaming legal norms with Google Search)
- **Investigacion** → deep-research (Gemini + You.com cross-check)
- **Corpus** → corpus/search (598 PDFs, keyword/hybrid)

Quick actions become contextual buttons that pre-fill the input:
- "Verificar vigencia de norma" → switches to Investigacion mode
- "Analizar norma" → switches to Investigacion mode with analyze-deep prompt

This reduces from 7 entry points to 4 clear modes.

## Google + Microsoft: Keep Both

Both suites are fully implemented (28 Rust commands). User chooses provider in Settings.
Frontend hooks already support both via `useGmailEvents()` and `useMicrosoftEvents()`.
No additional Rust work needed — just wire Settings UI buttons in P1.

## Credential Placeholders to Fill (P1)

| Placeholder | File | What to insert |
|-------------|------|---------------|
| `PASTE_YOUR_ANON_KEY_HERE` | `src/lib/supabase.ts:11` | Supabase project anon key |
| `YOUR_GOOGLE_CLIENT_ID` | `src-tauri/src/gmail/auth.rs:13` | Google Cloud OAuth client ID |
| `YOUR_GOOGLE_CLIENT_SECRET` | `src-tauri/src/gmail/auth.rs:14` | Google Cloud OAuth client secret |

Microsoft OAuth credentials location: check `src-tauri/src/lib.rs` for MS_CLIENT_ID constant.

## Dependency on Ollama

**Decision: Keyword-only fallback for desktop users.**
- Corpus search defaults to `keyword` mode
- `hybrid` and `semantic` modes require Ollama running locally
- Show UI hint: "Instala Ollama para busqueda semantica avanzada" in Corpus tab
- Long-term: Move embeddings to Vercel (pgvector on Supabase already has them)

## Summary: What Changes

| Category | Before | After |
|----------|--------|-------|
| Backend AI endpoints | 12 | 10 (cut v1 orchestra + spij/query) |
| Frontend pages | 8 + time tracking | 8 (no time tracking) |
| Mock elements | 11 | 0 (all wired or removed by P1) |
| Rust commands | 28 | 28 (all kept, both providers) |
| CORS | None | All Vercel routes get headers |
