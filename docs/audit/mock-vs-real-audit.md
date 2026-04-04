# Mock vs Real Audit — LexAI
**Date:** 2026-04-04

## How Demo Mode Works

- Trigger: `localStorage.getItem("lexai_demo") === "true"` in AuthContext.tsx
- User: mockProfile (Dr. Narem Roel)
- Hook: `useApiData()` checks `isDemo` flag — if true, returns mock data immediately, skips API call
- All write operations (POST/PATCH/DELETE) are skipped in demo mode

## Page-by-Page Inventory

### Dashboard (Index.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| Stats cards (cases, emails, hours, load) | REAL | Supabase `/api/dashboard` with mock fallback |
| Pending tasks list | REAL | From dashboard API |
| Recent time entries | CUT | Time tracking removed per design spec |
| AI suggestions cards | REAL | Supabase `/api/suggestions` + Tauri `generate_suggestions` |
| News widget (line 193) | BUG | Hardcoded `mockNews` — should call `/api/news` |
| Time logging form | CUT | Time tracking removed |

### Correos (Correos.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| Email list | REAL | Supabase `/api/emails` with mock fallback |
| Gmail sync button | REAL | `useGmailEvents().manualSync()` → Tauri `gmail_sync` |
| Email detail view | REAL | Displays email body, AI analysis |
| Urgency override | REAL | POST `/api/triage-override` → Supabase |
| "Enviar" button (line 61) | MOCK | No onClick handler |
| "Redactar con IA" button (line 62) | MOCK | No onClick handler |
| "Generar respuesta IA" button (line 89) | MOCK | No onClick handler |

### IALegal (IALegal.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| Chat interface (Consulta tab) | REAL | `streamSSE` → Tauri/Vercel claude-orchestra |
| Gemini search (Busqueda tab) | REAL | `streamSSE` → Tauri/Vercel gemini-rag |
| Deep research (Investigacion tab) | REAL | `streamSSE` → Tauri/Vercel deep-research |
| Corpus search | REAL | Supabase `/api/corpus/search` |
| Quick action: "Redactar" | MOCK | Sets input text only, doesn't call API |
| Quick action: "Subir Documento" | MOCK | Sets input text only |
| Quick action: "Verificar Vigencia" | MOCK | Sets input text only |
| Demo mode AI response | MOCK | Adds user message but generates no AI response |

### Casos (Casos.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| Cases list | REAL | Supabase `/api/cases` with mock fallback |
| Case detail tabs | REAL | Resumen, Journal, Documentos tabs render |
| Journal entries display | REAL | Supabase `/api/client-journal` |
| Add journal entry form (lines 82-91) | MOCK | Textarea + select + button with NO handlers |
| Document upload dropzone (lines 108-110) | MOCK | No upload handler — being replaced by Drive in P2 |
| Document list (lines 113-127) | MOCK | Hardcoded static list |

### Calendario (Calendario.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| Week view grid | REAL | Renders calendar_events |
| Events display | REAL | From `useCalendarSync()` → Supabase, mock fallback |
| Manual sync button | REAL | `useCalendarSync().manualSync()` → Tauri `calendar_sync` |
| Business days calculator | REAL | Pure JS math, PERU_HOLIDAYS_2026, no API needed |
| Create event | REAL | `useCalendarSync().createEvent()` → Tauri |

### Noticias (Noticias.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| News feed list | REAL | `/api/news` via Tauri `fetch_news` with mock fallback |
| Category filter | REAL | Client-side filtering |
| Heat badges | REAL | From API response `heat_level` |
| "Generar resumen semanal" button (line 44) | MOCK | No onClick handler |
| "Analizar impacto" button (line 73) | MOCK | No onClick handler |

### Configuracion (Configuracion.tsx)
| Element | Status | Detail |
|---------|--------|--------|
| Gmail connection toggle | PARTIAL | `useGmailEvents()` state is real, but button may not trigger `gmail_auth_start` |
| Microsoft connection toggle | PARTIAL | `useMicrosoftEvents()` state is real, same issue |
| Triage settings (TriageSettings component) | REAL | Supabase read/write via `useTriageContext()` |
| Profile form | MOCK | Default values from mockProfile, "Guardar cambios" has no save handler |
| Writing style upload (line 152) | MOCK | No upload handler |

## Summary: 11 Mock Elements That Need Work

| # | Page | Element | Priority | P1 Action |
|---|------|---------|----------|-----------|
| 1 | Settings | Gmail OAuth button | HIGH | Wire to `gmail_auth_start` Tauri command |
| 2 | Settings | Microsoft OAuth button | HIGH | Wire to `ms_auth_start` Tauri command |
| 3 | Settings | Profile save button | MEDIUM | Wire to Supabase `profiles` upsert |
| 4 | Dashboard | News widget | MEDIUM | Replace hardcoded mockNews with `/api/news` call |
| 5 | Cases | Journal entry form | MEDIUM | Wire to POST `/api/client-journal` |
| 6 | Cases | Document section | DEFERRED | Replace with Drive integration (P2) |
| 7 | Correos | "Enviar" send button | MEDIUM | Wire to Tauri `gmail_send` / `outlook_send` |
| 8 | Correos | "Redactar con IA" | LOW | Wire to claude-orchestra for email drafting |
| 9 | Correos | "Generar respuesta IA" | LOW | Wire to claude-orchestra for reply generation |
| 10 | Noticias | "Generar resumen semanal" | LOW | Wire to news/analyze endpoint |
| 11 | Noticias | "Analizar impacto" | LOW | Wire to news/analyze per article |

## Credential Placeholders

### Supabase (CRITICAL)
`src/lib/supabase.ts` line 11:
```typescript
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";
```

### Google OAuth (CRITICAL)
`src-tauri/src/gmail/auth.rs` lines 13-14:
```rust
const CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "YOUR_GOOGLE_CLIENT_SECRET";
```
