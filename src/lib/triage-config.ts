/**
 * LexAI Triage Configuration Manager
 *
 * Manages user-configurable triage settings, auto-learning from
 * corrections, and sender reputation scoring.
 *
 * Tables used (Supabase, already deployed):
 *   - user_triage_config  (user_id, config_key, entries JSONB)
 *   - labeled_examples    (corrections / overrides)
 *   - emails              (user_id, "from", triage_score, etc.)
 *   - contacts            (user_id, email, name, contact_type, tags)
 *   - deadlines + cases   (active deadlines joined by case_id)
 */

import { supabase } from "./supabase";
import {
  CRITICAL_KEYWORDS,
  HIGH_KEYWORDS,
  MEDIUM_KEYWORDS,
} from "./email-triage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single keyword rule inside a triage tier. */
export interface KeywordEntry {
  keyword: string;
  /** Score contribution (e.g. 8 for critical, 2.5 for high, 1.5 for medium). */
  weight: number;
  /** Keyword category tag. */
  tag: "default" | "procesal" | "tributario" | "corporativo" | "laboral" | "custom";
  enabled: boolean;
}

/** A VIP or priority sender entry. */
export interface VipEntry {
  /** Email address or domain. */
  email: string;
  /** Human-readable display name. */
  label: string;
}

/** An auto-archive rule matching newsletters, marketing, etc. */
export interface ArchiveRule {
  /** Domain or regex pattern string. */
  pattern: string;
  type: "domain" | "pattern";
}

/** Per-keyword weight adjustment learned from user corrections. */
export interface KeywordAdjustment {
  keyword: string;
  /** Learned modifier in the range [-3.0, +3.0]. */
  weightModifier: number;
  /** Number of labeled examples that included this keyword. */
  sampleCount: number;
}

/** Sender reputation score computed from email history and corrections. */
export interface SenderScore {
  email: string;
  /** Reputation score 0-10. */
  score: number;
  emailCount: number;
  overrideCount: number;
  /** ISO timestamp of the last email received from this sender. */
  lastSeen: string;
}

/**
 * Full triage context enriched with user-specific configuration,
 * learned adjustments, and sender reputation data.
 */
export interface EnrichedTriageContext {
  // --- Original TriageContext fields ---
  vipSenders: string[];
  knownClients: { email: string; name: string; caseId?: string }[];
  activeDeadlines: {
    caseId: string;
    caseName: string;
    deadline: string;
    caseNumber?: string;
  }[];
  senderHistory: {
    email: string;
    avgPriority: number;
    emailCount: number;
    lastSeen: string;
  }[];

  // --- New enrichment fields ---
  userKeywords: {
    critical: KeywordEntry[];
    high: KeywordEntry[];
    medium: KeywordEntry[];
  };
  archiveRules: ArchiveRule[];
  keywordAdjustments: KeywordAdjustment[];
  senderScores: SenderScore[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Config keys stored in user_triage_config. */
const CONFIG_KEYS = [
  "critical_keywords",
  "high_keywords",
  "medium_keywords",
  "vip_senders",
  "archive_rules",
] as const;

/** Default weight per tier. */
const DEFAULT_WEIGHTS: Record<string, number> = {
  critical: 8,
  high: 2.5,
  medium: 1.5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an urgency label to a numeric value for comparison.
 *
 * @param urgency - Urgency label string.
 * @returns Numeric value: critical=4, high=3, medium=2, low=1, auto-archive=0.
 */
export function urgencyToNumeric(urgency: string): number {
  const map: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    "auto-archive": 0,
  };
  return map[urgency.toLowerCase()] ?? 1;
}

/**
 * Maps an urgency label to a 0-10 scale for sender scoring.
 *
 * @param urgency - Urgency label string.
 * @returns Score on 0-10 scale.
 */
function urgencyToTenScale(urgency: string): number {
  const map: Record<string, number> = {
    critical: 10,
    high: 7,
    medium: 4,
    low: 1,
    "auto-archive": 0,
  };
  return map[urgency.toLowerCase()] ?? 1;
}

/**
 * Converts a keyword string array into KeywordEntry objects.
 *
 * @param keywords - Raw keyword strings.
 * @param weight   - Default weight for the tier.
 * @returns Array of KeywordEntry with tag='default' and enabled=true.
 */
function toKeywordEntries(keywords: string[], weight: number): KeywordEntry[] {
  return keywords.map((kw) => ({
    keyword: kw,
    weight,
    tag: "default" as const,
    enabled: true,
  }));
}

// ---------------------------------------------------------------------------
// getDefaultKeywords
// ---------------------------------------------------------------------------

/**
 * Returns the hardcoded keyword arrays wrapped as KeywordEntry objects
 * with default weights and tag='default'.
 *
 * @returns Object with critical, high, and medium keyword entries.
 */
export function getDefaultKeywords(): {
  critical: KeywordEntry[];
  high: KeywordEntry[];
  medium: KeywordEntry[];
} {
  return {
    critical: toKeywordEntries(CRITICAL_KEYWORDS, DEFAULT_WEIGHTS.critical),
    high: toKeywordEntries(HIGH_KEYWORDS, DEFAULT_WEIGHTS.high),
    medium: toKeywordEntries(MEDIUM_KEYWORDS, DEFAULT_WEIGHTS.medium),
  };
}

// ---------------------------------------------------------------------------
// seedUserConfig
// ---------------------------------------------------------------------------

/**
 * Inserts default triage configuration rows for a new user.
 * Uses upsert with onConflict so it is safe to call multiple times.
 *
 * @param userId - Supabase user ID.
 */
export async function seedUserConfig(userId: string): Promise<void> {
  try {
    const defaults = getDefaultKeywords();

    const rows = [
      { user_id: userId, config_key: "critical_keywords", entries: defaults.critical },
      { user_id: userId, config_key: "high_keywords", entries: defaults.high },
      { user_id: userId, config_key: "medium_keywords", entries: defaults.medium },
      { user_id: userId, config_key: "vip_senders", entries: [] as VipEntry[] },
      { user_id: userId, config_key: "archive_rules", entries: [] as ArchiveRule[] },
    ];

    await supabase
      .from("user_triage_config")
      .upsert(rows, { onConflict: "user_id,config_key" });
  } catch (err) {
    console.error("[triage-config] seedUserConfig failed:", err);
  }
}

// ---------------------------------------------------------------------------
// saveUserConfig
// ---------------------------------------------------------------------------

/**
 * Upserts a single user_triage_config row.
 *
 * @param userId    - Supabase user ID.
 * @param configKey - Config key (e.g. 'critical_keywords').
 * @param entries   - Array to persist as JSONB.
 */
export async function saveUserConfig(
  userId: string,
  configKey: string,
  entries: any[],
): Promise<void> {
  try {
    await supabase
      .from("user_triage_config")
      .upsert(
        { user_id: userId, config_key: configKey, entries },
        { onConflict: "user_id,config_key" },
      );
  } catch (err) {
    console.error("[triage-config] saveUserConfig failed:", err);
  }
}

// ---------------------------------------------------------------------------
// computeKeywordAdjustments
// ---------------------------------------------------------------------------

/**
 * Learns keyword weight adjustments from user corrections.
 *
 * For each labeled_example where the user corrected the urgency,
 * keywords found in the email text contribute to an aggregate modifier
 * that nudges future scoring toward the user's preference.
 *
 * @param userId - Supabase user ID.
 * @returns Array of KeywordAdjustment for keywords with >= 3 samples.
 */
export async function computeKeywordAdjustments(
  userId: string,
): Promise<KeywordAdjustment[]> {
  try {
    const { data: corrections, error } = await supabase
      .from("labeled_examples")
      .select("email_subject, email_text, predicted_label, corrected_label")
      .eq("user_id", userId)
      .eq("field", "urgency")
      .not("corrected_label", "is", null);

    if (error || !corrections || corrections.length === 0) return [];

    // Collect all known keywords for fast matching
    const allKeywords = [
      ...CRITICAL_KEYWORDS,
      ...HIGH_KEYWORDS,
      ...MEDIUM_KEYWORDS,
    ];

    // Accumulate per-keyword upgrade/downgrade counts
    const stats = new Map<
      string,
      { upgrades: number; downgrades: number; total: number }
    >();

    for (const row of corrections) {
      const predictedNum = urgencyToNumeric(row.predicted_label ?? "");
      const correctedNum = urgencyToNumeric(row.corrected_label ?? "");
      if (predictedNum === correctedNum) continue;

      const isDowngrade = correctedNum < predictedNum;
      const isUpgrade = correctedNum > predictedNum;

      // Search in subject + first 200 chars of body
      const searchText = [
        row.email_subject ?? "",
        (row.email_text ?? "").slice(0, 200),
      ]
        .join(" ")
        .toUpperCase();

      for (const kw of allKeywords) {
        if (searchText.includes(kw.toUpperCase())) {
          const existing = stats.get(kw) ?? { upgrades: 0, downgrades: 0, total: 0 };
          if (isDowngrade) existing.downgrades++;
          if (isUpgrade) existing.upgrades++;
          existing.total++;
          stats.set(kw, existing);
        }
      }
    }

    // Build adjustment array (minimum 3 samples, cap -3 to +3)
    const adjustments: KeywordAdjustment[] = [];
    for (const [keyword, { upgrades, downgrades, total }] of stats) {
      if (total < 3) continue;
      const raw = -0.3 * (downgrades - upgrades) / total;
      const weightModifier = Math.max(-3.0, Math.min(3.0, raw));
      adjustments.push({ keyword, weightModifier, sampleCount: total });
    }

    return adjustments;
  } catch (err) {
    console.error("[triage-config] computeKeywordAdjustments failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// computeSenderScores
// ---------------------------------------------------------------------------

/**
 * Computes sender reputation scores from email history and corrections.
 *
 * The score blends the sender's average triage score with any
 * user-provided corrections, weighting corrections more heavily (60%)
 * to reflect explicit user intent.
 *
 * @param userId - Supabase user ID.
 * @returns Array of SenderScore for the top 200 senders.
 */
export async function computeSenderScores(
  userId: string,
): Promise<SenderScore[]> {
  try {
    // Fetch emails grouped by sender.
    // Supabase JS doesn't support GROUP BY, so we pull rows and aggregate locally.
    const { data: emails, error: emailErr } = await supabase
      .from("emails")
      .select("from, triage_score, triage_overridden, received_at")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(5000);

    if (emailErr || !emails || emails.length === 0) return [];

    // Aggregate by sender
    const senderMap = new Map<
      string,
      {
        totalScore: number;
        count: number;
        overrides: number;
        lastSeen: string;
      }
    >();

    for (const e of emails) {
      const sender = (e.from ?? "").toLowerCase().trim();
      if (!sender) continue;
      const existing = senderMap.get(sender) ?? {
        totalScore: 0,
        count: 0,
        overrides: 0,
        lastSeen: e.received_at ?? "",
      };
      existing.totalScore += e.triage_score ?? 0;
      existing.count++;
      if (e.triage_overridden) existing.overrides++;
      // Keep the most recent received_at
      if ((e.received_at ?? "") > existing.lastSeen) {
        existing.lastSeen = e.received_at;
      }
      senderMap.set(sender, existing);
    }

    // Keep top 200 by email count
    const topSenders = [...senderMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 200);

    // Fetch corrections for these senders
    const senderEmails = topSenders.map(([email]) => email);
    const { data: corrections } = await supabase
      .from("labeled_examples")
      .select("sender_email, corrected_label")
      .eq("user_id", userId)
      .eq("field", "urgency")
      .not("corrected_label", "is", null)
      .in("sender_email", senderEmails);

    // Build correction averages per sender
    const correctionMap = new Map<string, { total: number; count: number }>();
    if (corrections) {
      for (const c of corrections) {
        const se = (c.sender_email ?? "").toLowerCase().trim();
        if (!se) continue;
        const mapped = urgencyToTenScale(c.corrected_label ?? "");
        const existing = correctionMap.get(se) ?? { total: 0, count: 0 };
        existing.total += mapped;
        existing.count++;
        correctionMap.set(se, existing);
      }
    }

    // Compute final scores
    const scores: SenderScore[] = [];
    for (const [email, agg] of topSenders) {
      // Normalize average triage_score to 0-10 (triage scores are roughly 0-10 already)
      const base = Math.max(0, Math.min(10, agg.totalScore / agg.count));

      const correction = correctionMap.get(email);
      let score: number;
      if (correction && correction.count > 0) {
        const avgCorrected = correction.total / correction.count;
        score = 0.4 * base + 0.6 * avgCorrected;
      } else {
        score = base;
      }

      scores.push({
        email,
        score: Math.round(score * 100) / 100,
        emailCount: agg.count,
        overrideCount: agg.overrides,
        lastSeen: agg.lastSeen,
      });
    }

    return scores;
  } catch (err) {
    console.error("[triage-config] computeSenderScores failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// loadTriageContext
// ---------------------------------------------------------------------------

/**
 * Loads the full enriched triage context for a user.
 *
 * Assembles user keyword config, VIP list, archive rules, keyword
 * adjustments, sender reputation, known clients, and active deadlines
 * into a single EnrichedTriageContext object.
 *
 * If the user has no saved config rows, they are seeded with defaults
 * before proceeding.
 *
 * @param userId - Supabase user ID.
 * @returns Fully populated EnrichedTriageContext.
 */
export async function loadTriageContext(
  userId: string,
): Promise<EnrichedTriageContext> {
  // Default empty context
  const empty: EnrichedTriageContext = {
    vipSenders: [],
    knownClients: [],
    activeDeadlines: [],
    senderHistory: [],
    userKeywords: getDefaultKeywords(),
    archiveRules: [],
    keywordAdjustments: [],
    senderScores: [],
  };

  try {
    // 1. Load user_triage_config rows
    let { data: configRows, error: configErr } = await supabase
      .from("user_triage_config")
      .select("config_key, entries")
      .eq("user_id", userId);

    if (configErr) {
      console.error("[triage-config] loadTriageContext config query failed:", configErr);
      return empty;
    }

    // 2. If no rows exist, seed defaults first
    if (!configRows || configRows.length === 0) {
      await seedUserConfig(userId);
      const refetch = await supabase
        .from("user_triage_config")
        .select("config_key, entries")
        .eq("user_id", userId);
      configRows = refetch.data ?? [];
    }

    // 3. Parse config entries
    const configMap = new Map<string, any[]>();
    for (const row of configRows) {
      configMap.set(row.config_key, Array.isArray(row.entries) ? row.entries : []);
    }

    const criticalKeywords: KeywordEntry[] =
      (configMap.get("critical_keywords") as KeywordEntry[]) ?? getDefaultKeywords().critical;
    const highKeywords: KeywordEntry[] =
      (configMap.get("high_keywords") as KeywordEntry[]) ?? getDefaultKeywords().high;
    const mediumKeywords: KeywordEntry[] =
      (configMap.get("medium_keywords") as KeywordEntry[]) ?? getDefaultKeywords().medium;

    const vipEntries: VipEntry[] =
      (configMap.get("vip_senders") as VipEntry[]) ?? [];
    const archiveRules: ArchiveRule[] =
      (configMap.get("archive_rules") as ArchiveRule[]) ?? [];

    // Extract VIP sender emails/domains as flat string array
    const vipSenders = vipEntries.map((v) => v.email);

    // 4-5. Compute adjustments and sender scores in parallel
    const [keywordAdjustments, senderScores] = await Promise.all([
      computeKeywordAdjustments(userId),
      computeSenderScores(userId),
    ]);

    // 6. Query contacts for knownClients
    const { data: contacts } = await supabase
      .from("contacts")
      .select("email, name, tags")
      .eq("user_id", userId)
      .not("email", "is", null);

    const knownClients: { email: string; name: string; caseId?: string }[] = (
      contacts ?? []
    ).map((c: any) => ({
      email: c.email,
      name: c.name ?? "",
      caseId: undefined,
    }));

    // 7. Query deadlines joined with cases for activeDeadlines
    const today = new Date().toISOString().slice(0, 10);
    const { data: deadlineRows } = await supabase
      .from("deadlines")
      .select("case_id, title, computed_deadline, cases(case_name, case_number)")
      .eq("user_id", userId)
      .eq("status", "pendiente")
      .gte("computed_deadline", today);

    const activeDeadlines: {
      caseId: string;
      caseName: string;
      deadline: string;
      caseNumber?: string;
    }[] = (deadlineRows ?? []).map((d: any) => {
      const caseData = d.cases ?? {};
      return {
        caseId: d.case_id ?? "",
        caseName: caseData.case_name ?? d.title ?? "",
        deadline: d.computed_deadline ?? "",
        caseNumber: caseData.case_number,
      };
    });

    // 8. Build sender history from senderScores
    const senderHistory = senderScores.map((s) => ({
      email: s.email,
      avgPriority: s.score,
      emailCount: s.emailCount,
      lastSeen: s.lastSeen,
    }));

    return {
      vipSenders,
      knownClients,
      activeDeadlines,
      senderHistory,
      userKeywords: {
        critical: criticalKeywords,
        high: highKeywords,
        medium: mediumKeywords,
      },
      archiveRules,
      keywordAdjustments,
      senderScores,
    };
  } catch (err) {
    console.error("[triage-config] loadTriageContext failed:", err);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// getMockTriageContext
// ---------------------------------------------------------------------------

/**
 * Returns a mock EnrichedTriageContext for demo/development mode.
 * Uses realistic Peruvian legal domain data.
 *
 * @returns Static EnrichedTriageContext with sample data.
 */
export function getMockTriageContext(): EnrichedTriageContext {
  const defaults = getDefaultKeywords();

  return {
    vipSenders: [
      "juzgado.civil@pj.gob.pe",
      "mesa.partes@sunat.gob.pe",
      "notificaciones@indecopi.gob.pe",
      "carlos.mendoza@estudio-legalpe.com",
    ],
    knownClients: [
      { email: "gerencia@mineraperu.com", name: "Minera Peru SAC", caseId: "case-001" },
      { email: "legal@techandes.pe", name: "TechAndes SRL", caseId: "case-002" },
      { email: "rrhh@bancosur.com.pe", name: "Banco Sur SA" },
      { email: "adm@constructoralima.pe", name: "Constructora Lima EIRL", caseId: "case-003" },
    ],
    activeDeadlines: [
      {
        caseId: "case-001",
        caseName: "Minera Peru vs. OEFA",
        deadline: "2026-04-07",
        caseNumber: "00234-2025-0-1801-JR-CI-01",
      },
      {
        caseId: "case-002",
        caseName: "TechAndes - Fiscalizacion SUNAT",
        deadline: "2026-04-10",
        caseNumber: "0892-2025",
      },
      {
        caseId: "case-003",
        caseName: "Constructora Lima - Arbitraje OSCE",
        deadline: "2026-04-15",
        caseNumber: "00456-2025-0-1801-JR-CA-01",
      },
    ],
    senderHistory: [
      { email: "juzgado.civil@pj.gob.pe", avgPriority: 8.5, emailCount: 42, lastSeen: "2026-04-02T14:30:00Z" },
      { email: "mesa.partes@sunat.gob.pe", avgPriority: 7.2, emailCount: 28, lastSeen: "2026-04-01T09:15:00Z" },
      { email: "newsletter@legalperu.com", avgPriority: 1.0, emailCount: 95, lastSeen: "2026-04-03T06:00:00Z" },
      { email: "carlos.mendoza@estudio-legalpe.com", avgPriority: 5.8, emailCount: 15, lastSeen: "2026-03-30T16:45:00Z" },
    ],
    userKeywords: {
      critical: [
        ...defaults.critical,
        { keyword: "ALLANAMIENTO", weight: 8, tag: "procesal", enabled: true },
      ],
      high: [
        ...defaults.high,
        { keyword: "LAUDO ARBITRAL", weight: 2.5, tag: "corporativo", enabled: true },
      ],
      medium: [
        ...defaults.medium,
        { keyword: "BOLETA DE PAGO", weight: 1.5, tag: "laboral", enabled: true },
      ],
    },
    archiveRules: [
      { pattern: "newsletter@legalperu.com", type: "domain" },
      { pattern: "noreply@", type: "pattern" },
      { pattern: "marketing\\..*\\.com$", type: "pattern" },
    ],
    keywordAdjustments: [
      { keyword: "NOTIFICACION", weightModifier: -0.5, sampleCount: 7 },
      { keyword: "EMBARGO", weightModifier: 0.8, sampleCount: 4 },
      { keyword: "CONTRATO", weightModifier: -0.3, sampleCount: 5 },
    ],
    senderScores: [
      { email: "juzgado.civil@pj.gob.pe", score: 9.2, emailCount: 42, overrideCount: 2, lastSeen: "2026-04-02T14:30:00Z" },
      { email: "mesa.partes@sunat.gob.pe", score: 7.8, emailCount: 28, overrideCount: 1, lastSeen: "2026-04-01T09:15:00Z" },
      { email: "newsletter@legalperu.com", score: 0.5, emailCount: 95, overrideCount: 12, lastSeen: "2026-04-03T06:00:00Z" },
      { email: "gerencia@mineraperu.com", score: 6.1, emailCount: 18, overrideCount: 0, lastSeen: "2026-03-28T11:00:00Z" },
      { email: "carlos.mendoza@estudio-legalpe.com", score: 5.4, emailCount: 15, overrideCount: 3, lastSeen: "2026-03-30T16:45:00Z" },
    ],
  };
}
