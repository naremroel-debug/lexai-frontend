/**
 * LexAI Email-to-Task Decision Matrix
 *
 * Converts triaged emails into tasks, suggestions, or journal entries
 * based on urgency, confidence, and deadline presence.
 *
 * Decision matrix:
 * | Urgency       | Confidence | Has Deadline | Action          |
 * |---------------|-----------|-------------|-----------------|
 * | critical      | >= 0.85   | any         | Auto-create task|
 * | high          | >= 0.85   | yes         | Auto-create task|
 * | high          | >= 0.85   | no          | Create suggestion|
 * | high          | < 0.85    | any         | Create suggestion|
 * | medium        | any       | yes         | Create suggestion|
 * | medium/low/auto-archive | any | no     | Nothing (skip)  |
 */

import { supabase } from "./supabase";
import type { TriageResult, EmailInput, Urgency } from "./email-triage";
import { extractEmailAddress } from "./email-triage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskRow {
  title: string;
  description: string;
  case_id: string | null;
  priority: Urgency;
  due_date: string | null;
  due_date_type: string;
  source: "email";
  source_id: string;
  status: string;
  user_id: string;
  ai_enriched: boolean;
}

interface SuggestionRow {
  type: "email_action";
  title: string;
  body: string;
  priority: Urgency;
  reference_id: string;
  action_url: string;
  status: "pending";
  expires_at: string;
  user_id: string;
}

interface JournalRow {
  case_id: string;
  entry_type: "email";
  title: string;
  content: string;
  email_id: string;
  email_from: string;
  email_subject: string;
  occurred_at: string;
  user_id: string;
}

type DecisionAction = "create_task" | "create_suggestion" | "skip";

// ---------------------------------------------------------------------------
// Decision matrix
// ---------------------------------------------------------------------------

function decideAction(
  urgency: Urgency,
  confidence: number,
  hasDeadline: boolean,
): DecisionAction {
  if (urgency === "critical" && confidence >= 0.85) {
    return "create_task";
  }
  if (urgency === "critical") {
    // Critical with low confidence — never silently drop, surface as suggestion
    return "create_suggestion";
  }
  if (urgency === "high" && confidence >= 0.85 && hasDeadline) {
    return "create_task";
  }
  if (urgency === "high" && confidence >= 0.85 && !hasDeadline) {
    return "create_suggestion";
  }
  if (urgency === "high" && confidence < 0.85) {
    return "create_suggestion";
  }
  if (urgency === "medium" && hasDeadline) {
    return "create_suggestion";
  }
  // medium/low/auto-archive without deadline
  return "skip";
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

async function taskExistsForEmail(gmailId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id")
      .eq("source", "email")
      .eq("source_id", gmailId)
      .limit(1);
    if (error) {
      console.error("[email-to-tasks] taskExistsForEmail query error:", error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error("[email-to-tasks] taskExistsForEmail exception:", err);
    return false;
  }
}

async function suggestionExistsForEmail(gmailId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("suggestions")
      .select("id")
      .eq("reference_id", gmailId)
      .limit(1);
    if (error) {
      console.error("[email-to-tasks] suggestionExistsForEmail query error:", error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error("[email-to-tasks] suggestionExistsForEmail exception:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function buildTaskRow(
  email: EmailInput,
  triage: TriageResult,
  userId: string,
): TaskRow {
  const firstDeadline =
    triage.extractedEntities.deadlines?.[0] ??
    triage.extractedEntities.dates?.[0] ??
    null;

  return {
    title: email.subject,
    description: (email.body || "").slice(0, 500),
    case_id: triage.suggestedCaseId ?? null,
    priority: triage.urgency,
    due_date: firstDeadline,
    due_date_type: "dias_habiles",
    source: "email",
    source_id: email.id,
    status: "pendiente",
    user_id: userId,
    ai_enriched: false,
  };
}

function buildSuggestionRow(
  email: EmailInput,
  triage: TriageResult,
  userId: string,
): SuggestionRow {
  const firstDeadline =
    triage.extractedEntities.deadlines?.[0] ??
    triage.extractedEntities.dates?.[0] ??
    null;

  const senderName = email.from.includes("<")
    ? email.from.split("<")[0].trim()
    : extractEmailAddress(email.from);

  const topFactor = triage.factors[0];
  const factorDetail = topFactor ? topFactor.detail : "Requiere revisión";

  const expiresAt = firstDeadline
    ? firstDeadline
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    type: "email_action",
    title: `Revisar: ${email.subject.slice(0, 60)}`,
    body: `Email de ${senderName} \u2014 ${factorDetail}`,
    priority: triage.urgency,
    reference_id: email.id,
    action_url: `/correos?id=${email.id}`,
    status: "pending",
    expires_at: expiresAt,
    user_id: userId,
  };
}

function buildJournalRow(
  email: EmailInput,
  triage: TriageResult,
  userId: string,
): JournalRow | null {
  if (!triage.suggestedCaseId) return null;

  return {
    case_id: triage.suggestedCaseId,
    entry_type: "email",
    title: `Email recibido: ${email.subject.slice(0, 80)}`,
    content: (email.body || "").slice(0, 300),
    email_id: email.id,
    email_from: extractEmailAddress(email.from),
    email_subject: email.subject,
    occurred_at: email.date,
    user_id: userId,
  };
}

// ---------------------------------------------------------------------------
// Main entry: processTriagedEmail
// ---------------------------------------------------------------------------

/**
 * Processes a triaged email through the decision matrix.
 * Creates tasks, suggestions, and/or journal entries as appropriate.
 * Returns the action taken, or undefined on error.
 */
export async function processTriagedEmail(
  email: EmailInput,
  triageResult: TriageResult,
  userId: string,
): Promise<DecisionAction | undefined> {
  try {
    const hasDeadline =
      (triageResult.extractedEntities.deadlines?.length ?? 0) > 0 ||
      (triageResult.extractedEntities.dates?.length ?? 0) > 0;

    const action = decideAction(triageResult.urgency, triageResult.confidence, hasDeadline);

    if (action === "skip") return "skip";

    if (action === "create_task") {
      // Dedup check
      const exists = await taskExistsForEmail(email.id);
      if (exists) {
        console.log("[email-to-tasks] Task already exists for email:", email.id);
        return "skip";
      }

      const row = buildTaskRow(email, triageResult, userId);
      const { error } = await supabase.from("tasks").insert(row);
      if (error) {
        console.error("[email-to-tasks] Failed to create task:", error.message);
        return undefined;
      }

      // Create journal entry if case was matched
      const journalRow = buildJournalRow(email, triageResult, userId);
      if (journalRow) {
        const { error: journalError } = await supabase
          .from("journal_entries")
          .insert(journalRow);
        if (journalError) {
          console.error("[email-to-tasks] Failed to create journal entry:", journalError.message);
          // Non-fatal: task was created successfully
        }
      }

      return "create_task";
    }

    if (action === "create_suggestion") {
      // Dedup check
      const exists = await suggestionExistsForEmail(email.id);
      if (exists) {
        console.log("[email-to-tasks] Suggestion already exists for email:", email.id);
        return "skip";
      }

      const row = buildSuggestionRow(email, triageResult, userId);
      const { error } = await supabase.from("suggestions").insert(row);
      if (error) {
        console.error("[email-to-tasks] Failed to create suggestion:", error.message);
        return undefined;
      }

      return "create_suggestion";
    }

    return "skip";
  } catch (err) {
    console.error("[email-to-tasks] processTriagedEmail exception:", err);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Batch AI enrichment: batchEnrichTasks
// ---------------------------------------------------------------------------

const ENRICH_PROMPT = `Eres un asistente legal. Dado el siguiente email convertido en tarea, genera:
1. Un título breve que empiece con un verbo de acción en infinitivo (ej: "Responder requerimiento de SUNAT", "Revisar sentencia del caso 1234-2024").
2. Una descripción de 1-2 oraciones explicando la acción requerida.

Responde SOLO en formato JSON: { "title": "...", "description": "..." }

Tarea original:
Asunto: {subject}
Descripción: {description}
Prioridad: {priority}`;

/**
 * Queries unenriched email-sourced tasks and uses AI to generate
 * action-verb titles and descriptions in Spanish.
 * Processes up to 10 tasks per batch to avoid overloading.
 */
export async function batchEnrichTasks(userId: string): Promise<number> {
  try {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, title, description, priority")
      .eq("source", "email")
      .eq("ai_enriched", false)
      .eq("user_id", userId)
      .limit(10);

    if (error) {
      console.error("[email-to-tasks] batchEnrichTasks query error:", error.message);
      return 0;
    }

    if (!tasks || tasks.length === 0) return 0;

    // Check if Tauri invoke is available
    const isTauri = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
    if (!isTauri) {
      console.warn("[email-to-tasks] Tauri not available, skipping AI enrichment");
      return 0;
    }

    let invoke: ((cmd: string, args?: any) => Promise<any>) | null = null;
    try {
      const mod = await import("@tauri-apps/api/core");
      invoke = mod.invoke;
    } catch {
      console.error("[email-to-tasks] Failed to import @tauri-apps/api/core");
      return 0;
    }

    let enrichedCount = 0;

    for (const task of tasks) {
      try {
        const prompt = ENRICH_PROMPT
          .replace("{subject}", task.title || "")
          .replace("{description}", (task.description || "").slice(0, 300))
          .replace("{priority}", task.priority || "medium");

        const response = await invoke("ai_chat", {
          message: prompt,
          model: "gemini-flash",
        });

        // Parse AI response — expect JSON with title and description
        const text = typeof response === "string" ? response : response?.text || response?.message || "";
        const jsonMatch = text.match(/\{[\s\S]*"title"[\s\S]*"description"[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn("[email-to-tasks] Could not parse AI response for task:", task.id);
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.title?.trim() || !parsed.description?.trim()) continue;

        const { error: updateError } = await supabase
          .from("tasks")
          .update({
            ai_title: parsed.title,
            ai_description: parsed.description,
            ai_enriched: true,
          })
          .eq("id", task.id);

        if (updateError) {
          console.error("[email-to-tasks] Failed to update task:", task.id, updateError.message);
        } else {
          enrichedCount++;
        }
      } catch (taskErr) {
        console.error("[email-to-tasks] Error enriching task:", task.id, taskErr);
        // Continue with next task
      }
    }

    return enrichedCount;
  } catch (err) {
    console.error("[email-to-tasks] batchEnrichTasks exception:", err);
    return 0;
  }
}
