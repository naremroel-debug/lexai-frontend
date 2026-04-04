# IA Legal Page Redesign — Design Spec

**Date:** 2026-04-04
**Replaces:** Current IALegal.tsx with 3 AI modes (Consulta/Investigacion/Corpus) + quick actions + mock data
**Layout:** Three-column IDE-style (Results | Document Viewer | Collapsible Chat)

---

## Problem

The current IA Legal page has too many modes (Consulta, Investigacion, Corpus), quick actions that are risky ("Verificar vigencia" could mislead lawyers), and still displays mock data. The UI is scattered — users don't know where to start.

## Solution

One unified page with three columns:
1. **Left panel:** Search results list with Corpus/SPIJ tabs
2. **Center panel:** Full document viewer with highlighted snippets
3. **Right panel:** Collapsible AI chat sidebar

A single search bar at the top drives everything. No mode switching. No risky verification features.

---

## Layout

### Top: Unified Search Bar

- Full-width search input with placeholder: "Buscar norma, decreto, ley, o preguntar a la IA..."
- Keyboard shortcut hint (Cmd+K / Ctrl+K) to focus
- Submitting a search query:
  - Runs corpus/SPIJ search (populates left panel results)
  - Simultaneously sends the query to AI chat (populates right panel response)
  - If a result is auto-selected, opens it in center panel

### Left Panel: Results List (220px fixed width)

**Tabs:**
- **Corpus (598)** — Searches the 598-PDF local legal corpus
- **SPIJ** — Searches SPIJ government database via Vercel `/api/spij/chat`
- Switching tabs re-runs the current search query against the new source
- Active tab has teal bottom border + teal background tint

**Search mode pills (below tabs, corpus only):**
- keyword | hybrid | semantic
- Active pill is teal, others are muted
- Default: hybrid

**Results:**
- Each result shows: title (bold), source + year (small), relevance % (teal)
- Selected result has teal border + teal background tint
- Click a result → opens the document in the center panel
- Result count + search time displayed ("12 resultados . 0.3s")

**Data flow:**
- Corpus tab → calls `/api/corpus/search` with `{ q, mode, limit: 20 }`
- SPIJ tab → calls `/api/spij/chat` via Vercel (streaming) or `/api/spij/research` for non-streaming

### Center Panel: Document Viewer (flex: 1, takes remaining space)

**Header:**
- Document icon + title (bold, 12px)
- Metadata line: published date, source, URL, article count
- Displayed when a document is selected from results

**Content area:**
- Full document text rendered with proper heading hierarchy
- Search keywords highlighted with teal `<mark>` tags
- When AI chat references a specific article (e.g., "Art. 5"):
  - The referenced section gets a teal left border (3px) + teal background tint
  - Page smooth-scrolls to that section
  - Label "referenciado en chat" appears next to the article heading

**Empty state:**
- When no document is selected: centered message "Selecciona un resultado para ver el documento"
- Illustration or icon for visual weight

### Right Panel: Collapsible AI Chat (240px, collapsible to ~40px)

**Header:**
- "Chat IA" label + collapse toggle button ("Ocultar" / "Mostrar")
- When collapsed: thin vertical bar with chat icon, click to expand

**Chat area:**
- User messages: teal background, right-aligned, rounded bubbles
- AI messages: dark card background, left-aligned
- AI responses contain underlined teal links to specific articles
- Clicking a link in chat → scrolls + highlights that article in the center panel
- Sources cited at bottom of each AI response (small, muted text)

**Input:**
- Placeholder: "Pregunta sobre este documento..."
- Send button (teal, arrow icon)
- Checkbox below input: "☐ Validar bibliografía (usará más tokens)"
  - Unchecked (default): Fast response via claude-orchestra-v2 without verification harness
  - Checked: Response goes through the full verification pipeline (circuit breaker + citation verification via Gemini + You.com). Slower but each cited source is verified.
  - Visual: small checkbox + muted text, not prominent — power user feature
- Disclaimer: "IA puede cometer errores . Verifica siempre" (7px, muted, centered)

**Chat context:**
- The AI chat is contextual — it knows which document is currently open in the viewer
- Queries are sent to `/api/claude-orchestra-v2` via `legacyFetchWithSupabaseAuth`
- The request includes: user message + currently viewed document ID/title for context

**Collapse behavior:**
- Toggle button in header switches between expanded (240px) and collapsed (~40px)
- Collapsed state shows a thin bar with a chat bubble icon
- Click the collapsed bar to expand
- State persisted in component (not localStorage — resets on page reload)

---

## What Was Removed

| Removed | Reason |
|---------|--------|
| Mode selector (Consulta/Investigacion/Corpus) | Unnecessary — one search bar does it all |
| Quick actions (Verificar vigencia, Analizar norma) | Risky — "verificar vigencia" could mislead lawyers |
| Suggested prompts grid | Cluttered — empty state is cleaner |
| VerdictBadge ("VIGENTE") | Too risky to assert legal validity |
| ConfidenceBadge | Removed — AI shouldn't claim confidence levels |
| Multiple AI endpoints in frontend | Simplified to one: claude-orchestra-v2 |
| mobileTab toggle | Replaced with responsive column stacking |

## What Was Kept

| Kept | Why |
|------|-----|
| Corpus search (keyword/hybrid/semantic) | Core feature — search 598 PDFs |
| SPIJ integration | Core feature — government legal database |
| AI chat (Claude Orchestra v2) | Core feature — but as sidebar, not main view |
| Source citations in AI responses | Important for lawyer trust |
| Tool badges (corpus_search, gemini_search) | Shows which tools AI used |
| Markdown rendering in AI responses | Proper formatting |

---

## Responsive Behavior

### Desktop (>= 1024px)
- Three columns: Results (220px) | Document (flex) | Chat (240px, collapsible)

### Tablet (768px - 1023px)
- Two columns: Results + Document stacked vertically | Chat as slide-over drawer from right
- Chat toggle becomes a floating button

### Mobile (< 768px)
- Single column: Search bar on top
- Results list (scrollable)
- Tap result → document viewer (full screen, back button)
- Chat as bottom drawer (swipe up to open)

---

## Data Flow

```
Search bar input
  → Corpus tab active?
    → GET /api/corpus/search { q, mode, limit: 20 }
    → Results populate left panel
  → SPIJ tab active?
    → POST /api/spij/chat via Vercel (streaming)
    → Results populate left panel

Click result
  → Load document content in center panel
  → Highlight search terms

Chat input
  → "Validar bibliografía" checked?
    → Yes: POST /api/claude-orchestra-v2 { query, context: { document_id, document_title, verify: true } }
      → Vercel runs full harness (citation verification, cross-check)
      → Response includes _verification metadata
    → No: POST /api/claude-orchestra-v2 { query, context: { document_id, document_title, verify: false } }
      → Fast response, no verification overhead
  → AI response rendered in chat
  → Links in response → scroll + highlight center panel

Chat link click
  → Find referenced article/section in center panel
  → Smooth scroll to section
  → Apply teal left border + background highlight
```

---

## Components (File Map)

### New files
- `src/pages/IALegal.tsx` — Complete rewrite (current file replaced)
- `src/components/ia-legal/SearchBar.tsx` — Top search bar with Cmd+K
- `src/components/ia-legal/ResultsList.tsx` — Left panel with tabs + results
- `src/components/ia-legal/DocumentViewer.tsx` — Center panel document renderer
- `src/components/ia-legal/ChatSidebar.tsx` — Right panel collapsible chat

### Modified files
- `src/lib/api.ts` — Ensure corpus search and SPIJ routes work with Supabase auth

### Deleted
- Quick actions array and related components in IALegal.tsx
- VerdictBadge, ConfidenceBadge usage in this page (components stay in shared/ for other pages)

---

## UX Enhancements

1. **Cmd+K shortcut** — Focus search bar from anywhere on the page
2. **Search time display** — "12 resultados . 0.3s" builds trust in speed
3. **Relevance percentage** — Per-result, shown as small teal number
4. **Highlighted keywords** — Teal marks in document viewer for search terms
5. **Contextual chat** — AI knows which document you're reading
6. **Link-to-article** — Underlined teal links in chat scroll to exact section
7. **Teal left border** — Referenced sections are visually distinct
8. **Collapsible chat** — More document space when you don't need AI
9. **Empty states** — Clear CTAs: "Busca una norma para empezar"
10. **Disclaimer** — Minimal, always visible: "IA puede cometer errores"
