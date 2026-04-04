# P1: Foundation & Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page work with real data — no mocks remain, all Vercel API routes accessible from Tauri, all mock buttons wired.

**Architecture:** Tauri desktop (Rust + React) calls Supabase directly for CRUD and Vercel backend for AI features. CORS middleware on Vercel allows `tauri://localhost`. Frontend `api.ts` routes to the right backend based on context.

**Tech Stack:** Tauri 2, React 18, TypeScript, Rust, Next.js 14, Supabase, Vite

**Spec:** `docs/superpowers/specs/2026-04-04-lexai-macro-plan-design.md`
**Audit:** `docs/audit/simplification-decisions.md`

---

## Pre-Plan Discovery

During plan writing, we discovered several P0 "blockers" are already resolved:

| Item | Audit Said | Actual State |
|------|-----------|-------------|
| Supabase anon key | Placeholder | Real JWT already in `supabase.ts:11` |
| Google OAuth creds | Placeholder | Real creds in `gmail/auth.rs:13-14` |
| Settings OAuth buttons | Mock | Already wired to hooks |
| CORS middleware | None | Exists in `middleware.ts`, just missing Tauri origin |

This significantly reduces P1 scope. The remaining work is: CORS fix, mock button wiring, IA Legal mode merge, dead code removal, and E2E validation.

---

## File Map

**Backend (lexai-v3-backend/backend/):**
- Modify: `src/middleware.ts` — Add `tauri://localhost` to CORS allowlist
- Delete: `src/app/api/claude-orchestra/` — Dead code (v1 superseded by v2)
- Delete: `src/app/api/spij/query/` — Redundant with spij/chat

**Frontend (lexai-frontend-FINAL/.../):**
- Modify: `src/pages/Index.tsx` — Replace hardcoded mockNews with API call
- Modify: `src/pages/Correos.tsx` — Wire send, compose, AI reply buttons
- Modify: `src/pages/Casos.tsx` — Wire journal entry form, remove document upload
- Modify: `src/pages/Noticias.tsx` — Wire resumen semanal + analizar impacto buttons
- Modify: `src/pages/IALegal.tsx` — Merge Consulta + Busqueda into 3 modes
- Modify: `src/pages/Configuracion.tsx` — Wire profile save button
- Modify: `src/lib/api.ts` — Remove time-entries routes, add missing Vercel routes
- Modify: `src/lib/mockData.ts` — Remove mockTimeEntries

---

## Task 1: Add Tauri Origin to CORS Middleware

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\middleware.ts`

The CORS middleware already exists and handles preflight + response headers. It just needs `tauri://localhost` added to the allowlist.

- [ ] **Step 1: Read the current middleware**

Read `src/middleware.ts` to confirm the ALLOWED array at lines 4-9.

- [ ] **Step 2: Add tauri://localhost to the ALLOWED array**

In `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\middleware.ts`, add `'tauri://localhost'` to the ALLOWED array:

```typescript
const ALLOWED = [
  'https://lexai-copiloto-legal.vercel.app',
  'https://lexai-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'tauri://localhost',
  'https://tauri.localhost',
]
```

Both `tauri://localhost` (production Tauri) and `https://tauri.localhost` (Tauri dev on some platforms) are needed.

- [ ] **Step 3: Verify the backend still builds**

```bash
cd "C:/Users/NARO/Downloads/lexai-v3-backend/backend"
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/NARO/Downloads/lexai-v3-backend/backend"
git add src/middleware.ts
git commit -m "fix: add Tauri origins to CORS allowlist"
```

---

## Task 2: Delete Dead Backend Code

**Files:**
- Delete: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\claude-orchestra\` (entire directory)
- Delete: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\spij\query\` (entire directory)

- [ ] **Step 1: Verify nothing references claude-orchestra v1**

```bash
cd "C:/Users/NARO/Downloads/lexai-v3-backend/backend"
grep -r "claude-orchestra" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: Only `src/app/api/claude-orchestra/route.ts` and `src/app/api/claude-orchestra-v2/route.ts`. No other files import from v1.

- [ ] **Step 2: Verify nothing references spij/query specifically**

```bash
cd "C:/Users/NARO/Downloads/lexai-v3-backend/backend"
grep -r "spij/query" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: Only `src/app/api/spij/query/route.ts`.

- [ ] **Step 3: Delete the directories**

```bash
cd "C:/Users/NARO/Downloads/lexai-v3-backend/backend"
rm -rf src/app/api/claude-orchestra
rm -rf src/app/api/spij/query
```

- [ ] **Step 4: Verify the backend still builds**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully` — two fewer routes in the output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead code — claude-orchestra v1 and spij/query"
```

---

## Task 3: Fix Dashboard Hardcoded mockNews

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\pages\Index.tsx`

The Dashboard has `mockNews.slice(0, 3)` hardcoded at line ~193 instead of fetching from the API.

- [ ] **Step 1: Read Index.tsx to find the exact mockNews usage**

Read `src/pages/Index.tsx` and locate:
1. The mockNews import at the top
2. The `mockNews.slice(0, 3).map(...)` in the JSX

- [ ] **Step 2: Add a news API call using useApiData**

Add a `useApiData` call for news alongside the existing dashboard/suggestions calls. Find the block where `useApiData` is called for dashboard and suggestions (around lines 22-26), and add:

```typescript
const { data: newsData } = useApiData<any[]>("/api/news", mockNews);
```

- [ ] **Step 3: Replace the hardcoded mockNews with the API data**

Find `mockNews.slice(0, 3).map(...)` and replace with:

```typescript
(newsData || []).slice(0, 3).map(...)
```

- [ ] **Step 4: Remove mockNews from imports if no longer used elsewhere**

Check if `mockNews` is still used anywhere else in the file. If the `useApiData` call above already passes `mockNews` as fallback, and no other code uses it directly, the import can stay (it's the fallback). If `mockNews` was imported alongside other mocks, keep the import line but just ensure the hardcoded usage is replaced.

- [ ] **Step 5: Remove mockTimeEntries import and time tracking code**

Find and remove:
- `mockTimeEntries` from the import line
- Any `useApiData` call for `/api/time-entries`
- The time logging form/widget JSX section
- Any local state related to time entries (e.g., `timeData`)

- [ ] **Step 6: Verify the frontend builds**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run build 2>&1 | tail -5
```

Expected: `✓ built in ~6s`

- [ ] **Step 7: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "fix: dashboard uses real news API, remove time tracking"
```

---

## Task 4: Wire Correos Mock Buttons

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\pages\Correos.tsx`

Three mock buttons need wiring: "Enviar" (send), "Redactar con IA" (compose with AI), "Generar respuesta IA" (AI reply).

- [ ] **Step 1: Read Correos.tsx fully**

Read the entire file to understand the current email composition state, the selected email, and available hooks.

- [ ] **Step 2: Wire the "Enviar" (Send) button**

The `useGmailEvents` hook exposes email sending via Tauri. Find the "Enviar" button (around line 61) and add an onClick handler:

```typescript
onClick={async () => {
  if (!composeBody.trim()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("gmail_send", {
      request: {
        to: composeTo,
        subject: composeSubject,
        body: composeBody,
      }
    });
    setComposing(false);
    setComposeBody("");
    setComposeTo("");
    setComposeSubject("");
  } catch (err) {
    console.error("[Correos] send error:", err);
  }
}}
```

If the component doesn't have `composeTo`, `composeSubject`, `composeBody` state variables, add them:

```typescript
const [composeTo, setComposeTo] = useState("");
const [composeSubject, setComposeSubject] = useState("");
const [composeBody, setComposeBody] = useState("");
```

- [ ] **Step 3: Wire "Generar respuesta IA" button**

Find the AI reply button (around line 89). Add an onClick that calls Claude Orchestra v2 via the API layer:

```typescript
onClick={async () => {
  if (!selected) return;
  setAiLoading(true);
  try {
    const res = await apiPost("/api/claude-orchestra-v2", {
      query: `Genera una respuesta profesional a este correo:\n\nDe: ${selected.from}\nAsunto: ${selected.subject}\n\n${selected.body?.substring(0, 2000)}`,
      context: { mode: "email-reply" }
    });
    if (res?.data?.answer) {
      setComposeBody(res.data.answer);
      setComposeTo(selected.from);
      setComposeSubject(`Re: ${selected.subject}`);
      setComposing(true);
    }
  } catch (err) {
    console.error("[Correos] AI reply error:", err);
  } finally {
    setAiLoading(false);
  }
}}
```

Add state if needed:
```typescript
const [aiLoading, setAiLoading] = useState(false);
```

- [ ] **Step 4: Wire "Redactar con IA" button similarly**

This opens the compose form and pre-fills with AI-generated draft. Similar pattern but with a generic compose prompt instead of reply context.

- [ ] **Step 5: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Correos.tsx
git commit -m "feat: wire email send, AI compose, and AI reply buttons"
```

---

## Task 5: Wire Casos Journal Form + Remove Document Upload

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\pages\Casos.tsx`

- [ ] **Step 1: Read Casos.tsx fully**

- [ ] **Step 2: Wire the journal entry form**

Find the "Agregar" button (around lines 82-90). The form has a textarea and type select. Add state and handler:

```typescript
const [journalText, setJournalText] = useState("");
const [journalType, setJournalType] = useState("nota");
```

Wire the textarea `onChange` to `setJournalText`, the select `onChange` to `setJournalType`, and the "Agregar" button:

```typescript
onClick={async () => {
  if (!journalText.trim() || !selectedCase) return;
  try {
    await apiPost("/api/client-journal", {
      case_id: selectedCase.id,
      content: journalText,
      entry_type: journalType,
    });
    setJournalText("");
    refetchJournal();
  } catch (err) {
    console.error("[Casos] journal add error:", err);
  }
}}
```

Wire the textarea value and onChange:
```tsx
<textarea
  value={journalText}
  onChange={(e) => setJournalText(e.target.value)}
  ...existing props...
/>
```

Wire the select:
```tsx
<select
  value={journalType}
  onChange={(e) => setJournalType(e.target.value)}
  ...existing props...
>
```

- [ ] **Step 3: Remove document upload section**

Find the document upload dropzone (lines 108-110) and the hardcoded document list (lines 113-127). Replace the entire section with a placeholder for P2 Drive integration:

```tsx
<div className="rounded-lg border-2 border-dashed border-muted p-6 text-center">
  <p className="text-sm text-muted-foreground">
    📁 Integración con Google Drive / OneDrive próximamente
  </p>
</div>
```

- [ ] **Step 4: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Casos.tsx
git commit -m "feat: wire journal entry form, replace doc upload with Drive placeholder"
```

---

## Task 6: Wire Noticias Buttons

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\pages\Noticias.tsx`

- [ ] **Step 1: Read Noticias.tsx fully**

- [ ] **Step 2: Wire "Generar resumen semanal" button**

Find the button (around line 44). Add state and handler:

```typescript
const [resumenLoading, setResumenLoading] = useState(false);
const [resumen, setResumen] = useState<string | null>(null);
```

```typescript
onClick={async () => {
  setResumenLoading(true);
  try {
    const res = await apiPost("/api/news/analyze", {});
    if (res?.data) {
      setResumen(typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2));
    }
  } catch (err) {
    console.error("[Noticias] resumen error:", err);
  } finally {
    setResumenLoading(false);
  }
}}
```

Add a section below the button to display the resumen when it exists:

```tsx
{resumen && (
  <div className="mt-3 p-4 rounded-lg bg-card border text-sm whitespace-pre-wrap">
    {resumen}
  </div>
)}
```

- [ ] **Step 3: Wire "Analizar impacto" per-article button**

Find the button (around line 73). This is per-article, so it needs the article context:

```typescript
const [analyzingId, setAnalyzingId] = useState<string | null>(null);
const [analyses, setAnalyses] = useState<Record<string, string>>({});
```

```typescript
onClick={async () => {
  setAnalyzingId(n.id);
  try {
    const res = await apiPost("/api/news/analyze", { newsId: n.id, title: n.title, summary: n.summary });
    if (res?.data) {
      setAnalyses(prev => ({ ...prev, [n.id]: typeof res.data === "string" ? res.data : JSON.stringify(res.data) }));
    }
  } catch (err) {
    console.error("[Noticias] analyze error:", err);
  } finally {
    setAnalyzingId(null);
  }
}}
```

Show analysis below the article when available:
```tsx
{analyses[n.id] && (
  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{analyses[n.id]}</p>
)}
```

- [ ] **Step 4: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Noticias.tsx
git commit -m "feat: wire weekly summary and per-article impact analysis"
```

---

## Task 7: Merge IA Legal to 3 Modes

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\pages\IALegal.tsx`

Currently has: Consulta, Busqueda, Investigacion (3 tabs) + Corpus search.
Target: Consulta (absorbs Busqueda), Investigacion, Corpus (3 modes).

- [ ] **Step 1: Read IALegal.tsx fully**

- [ ] **Step 2: Update the modes array**

Find the modes array (around lines 11-15). Replace:

```typescript
const modes = [
  { key: "consulta", icon: "⚖️", label: "Consulta", sub: "Claude Orchestra — asistente legal integral" },
  { key: "investigacion", icon: "🔬", label: "Investigación", sub: "Gemini + You.com — verificación cruzada" },
  { key: "corpus", icon: "📚", label: "Corpus", sub: "598 PDFs — búsqueda legal" },
];
```

- [ ] **Step 3: Update the API path mapping**

Find where the mode maps to an API path (the `streamSSE` call). Update:

```typescript
const apiPath =
  mode === "consulta" ? "/api/claude-orchestra-v2" :
  mode === "investigacion" ? "/api/deep-research" :
  "/api/corpus/search";
```

Remove any reference to `"/api/gemini-rag"` as a standalone mode. If Consulta mode needs to search SPIJ, Claude Orchestra v2 already has Gemini search as a tool — no separate call needed.

- [ ] **Step 4: Update quick actions**

Update the quick actions to reference the 3 modes:

```typescript
const quickActions = [
  { label: "Verificar vigencia", mode: "investigacion", prompt: "Verificar vigencia de: " },
  { label: "Analizar norma", mode: "investigacion", prompt: "Analizar en profundidad: " },
  { label: "Buscar en corpus", mode: "corpus", prompt: "" },
];
```

- [ ] **Step 5: Remove any "busqueda" references**

Search for `"busqueda"` in the file and remove all references — mode button, conditional rendering, API path mapping.

- [ ] **Step 6: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/IALegal.tsx
git commit -m "feat: merge Consulta + Busqueda into unified AI mode (3 modes total)"
```

---

## Task 8: Wire Profile Save in Settings

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\pages\Configuracion.tsx`

- [ ] **Step 1: Read Configuracion.tsx fully**

- [ ] **Step 2: Add profile save handler**

Find the "Guardar cambios" button (around line 143). Add state for profile fields if not already present:

```typescript
const [profileName, setProfileName] = useState(user?.name || "");
const [profileEmail, setProfileEmail] = useState(user?.email || "");
const [profileRole, setProfileRole] = useState(user?.role || "");
const [profileFirm, setProfileFirm] = useState(user?.firm || "");
const [saving, setSaving] = useState(false);
```

Wire the button:

```typescript
onClick={async () => {
  if (!user?.id) return;
  setSaving(true);
  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: profileName,
        email: profileEmail,
        role: profileRole,
        firm: profileFirm,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
  } catch (err) {
    console.error("[Config] profile save error:", err);
  } finally {
    setSaving(false);
  }
}}
```

Update button text to show saving state:

```tsx
<button ... disabled={saving}>
  {saving ? "Guardando..." : "Guardar cambios"}
</button>
```

- [ ] **Step 3: Wire form inputs to state**

Find each profile input field and add `value` and `onChange` props:

```tsx
<input value={profileName} onChange={(e) => setProfileName(e.target.value)} ...existing props... />
```

Repeat for email, role, firm fields.

- [ ] **Step 4: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Configuracion.tsx
git commit -m "feat: wire profile save to Supabase profiles table"
```

---

## Task 9: Clean Up Frontend Dead Code

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\lib\mockData.ts`
- Modify: `C:\Users\NARO\Downloads\lexai-frontend-FINAL\lexai-copiloto-legal-6ecd87ac-main\src\lib\api.ts`

- [ ] **Step 1: Remove mockTimeEntries from mockData.ts**

Read `mockData.ts`, find the `mockTimeEntries` export and remove it entirely. Keep all other mock data (it serves as demo mode fallback).

- [ ] **Step 2: Remove time-entries route from api.ts**

Read `api.ts`, find any reference to `/api/time-entries` and remove those route handlers. Also remove any reference to `/api/load-prediction` and `/api/reports/weekly`.

- [ ] **Step 3: Verify no other files import mockTimeEntries**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
grep -r "mockTimeEntries" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining imports.

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/mockData.ts src/lib/api.ts
git commit -m "chore: remove time tracking dead code from frontend"
```

---

## Task 10: E2E Smoke Test

This task requires user interaction for OAuth. The implementer prepares everything, then guides the user through manual testing.

- [ ] **Step 1: Start the Tauri dev server**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main"
npm run tauri:dev
```

If `tauri:dev` fails because Rust toolchain isn't in PATH, use:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri:dev
```

- [ ] **Step 2: Test Login**

Open the app. Attempt to log in with Supabase credentials. Verify:
- Login form submits
- Dashboard loads with real data (or empty state if no data in Supabase)
- No console errors about Supabase connection

- [ ] **Step 3: Test Gmail OAuth (requires user)**

Navigate to Configuracion. Click "Conectar Gmail". User must:
1. Complete Google OAuth consent screen in the browser that opens
2. Return to the app
3. Verify the button changes to "Desconectar"

- [ ] **Step 4: Test Gmail Sync**

Navigate to Correos. Click sync button. Verify:
- Spinner shows during sync
- Real emails appear (or empty state if no emails)
- No console errors

- [ ] **Step 5: Test AI Chat**

Navigate to IA Legal. Type a legal question in Consulta mode. Verify:
- Request goes to Vercel (`lexai-omega.vercel.app/api/claude-orchestra-v2`)
- Response streams back (or error message if Vercel backend needs auth)
- No CORS errors in console

- [ ] **Step 6: Test News**

Navigate to Noticias. Verify:
- News feed loads from API (not just mock data)
- "Generar resumen semanal" button triggers API call

- [ ] **Step 7: Document results**

Create `docs/audit/e2e-smoke-test-results.md` with pass/fail for each test. Note any issues found.

- [ ] **Step 8: Commit test results**

```bash
git add docs/audit/e2e-smoke-test-results.md
git commit -m "test: E2E smoke test results for P1"
```

---

## Task 11: Fix Backend .catch() Anti-Pattern

**Files:**
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\claude-orchestra-v2\route.ts` (line 313)
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\deep-research\route.ts` (lines 115, 227, 230, 246, 258)
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\gemini-rag\route.ts` (line 113)
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\news\analyze\route.ts` (line 143)
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\spij\research\route.ts` (line 101)
- Modify: `C:\Users\NARO\Downloads\lexai-v3-backend\backend\src\app\api\spij\analyze-deep\route.ts` (line 86)

- [ ] **Step 1: Read each file and find the .catch() pattern**

The pattern looks like:
```typescript
const { data, error } = await supabase.from(...).select(...)
  .catch(e => ({ data: null, error: e }))
```

- [ ] **Step 2: Remove .catch() from each occurrence**

Replace each instance with just the await (no .catch):
```typescript
const { data, error } = await supabase.from(...).select(...)
```

Supabase client doesn't throw — it returns `{ data, error }`. The `.catch()` never fires.

Do this for all 10 occurrences across the 6 files listed above.

- [ ] **Step 3: Verify backend builds**

```bash
cd "C:/Users/NARO/Downloads/lexai-v3-backend/backend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: remove .catch() anti-pattern from 6 API routes (10 occurrences)"
```

---

## P1 Exit Criteria Checklist

- [ ] CORS: Tauri origin added to backend middleware
- [ ] Dead code: Claude Orchestra v1 and spij/query deleted
- [ ] Dashboard: News from API, time tracking removed
- [ ] Correos: Send, compose, AI reply buttons work
- [ ] Casos: Journal form saves to Supabase, document upload replaced with Drive placeholder
- [ ] Noticias: Weekly summary and per-article analysis buttons work
- [ ] IA Legal: 3 modes (Consulta/Investigacion/Corpus), no Busqueda tab
- [ ] Configuracion: Profile save works
- [ ] Frontend: mockTimeEntries and time-entries routes removed
- [ ] Backend: .catch() anti-pattern fixed in 6 routes
- [ ] E2E: Smoke test documented with results
