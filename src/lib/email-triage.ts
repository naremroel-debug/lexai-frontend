/**
 * LexAI Email Triage Heuristic Engine
 *
 * Two-stage on-device classifier that resolves 60-80% of emails
 * without any API call.
 *
 * Stage 1 — Fast Filter (<1ms): hard rules on domain/header.
 *   Government domains, newsletters, VIP senders, known clients.
 *   When matched, returns with 100% confidence immediately.
 *
 * Stage 2 — Heuristic Scoring (<10ms): SpamAssassin-style weighted
 *   rules across 7 categories (sender, subject, temporal, structural,
 *   content, thread, critical_keyword). Score maps to urgency.
 */

import { analyzeSentiment } from './triage-sentiment';
import { fuzzyClassify } from './triage-fis';
import type { KeywordEntry, ArchiveRule, KeywordAdjustment, SenderScore } from './triage-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Urgency = 'critical' | 'high' | 'medium' | 'low' | 'auto-archive';

export interface TriageResult {
  urgency: Urgency;
  score: number;
  confidence: number; // 0-1
  stage: 1 | 2;
  factors: TriageFactor[];
  extractedEntities: ExtractedEntities;
  suggestedCaseId?: string;
  sentiment?: {
    polarity: number;
    urgencyModifier: number;
    emotions: { anger: number; fear: number; joy: number };
  };
  fisOutput?: {
    memberships: Record<string, number>;
    firedRules: { description: string; strength: number; output: string }[];
  };
}

export interface TriageFactor {
  category:
    | 'sender'
    | 'subject'
    | 'temporal'
    | 'structural'
    | 'content'
    | 'thread'
    | 'critical_keyword';
  rule: string;
  score: number;
  detail: string;
}

export interface ExtractedEntities {
  caseNumbers: string[];
  dates: string[];
  deadlines: string[];
  monetaryAmounts: string[];
  rucs: string[];
  legalRefs: string[];
}

export interface EmailInput {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  date: string; // ISO timestamp
  headers?: Record<string, string>;
  attachments?: { filename: string; mimeType: string; size: number }[];
  threadId?: string;
  threadMessages?: number;
  threadParticipants?: string[];
}

export interface TriageContext {
  vipSenders?: string[];
  knownClients?: { email: string; name: string; caseId?: string }[];
  activeDeadlines?: {
    caseId: string;
    caseName: string;
    deadline: string;
    caseNumber?: string;
  }[];
  senderHistory?: {
    email: string;
    avgPriority: number;
    emailCount: number;
    lastSeen: string;
  }[];
  userKeywords?: {
    critical: KeywordEntry[];
    high: KeywordEntry[];
    medium: KeywordEntry[];
  };
  archiveRules?: ArchiveRule[];
  keywordAdjustments?: KeywordAdjustment[];
  senderScores?: SenderScore[];
}

// ---------------------------------------------------------------------------
// Regex constants
// ---------------------------------------------------------------------------

/** Peruvian government domains — ANY *.gob.pe domain is official government mail. */
export const GOV_DOMAIN_RE =
  /^.+@.+\.gob\.pe$/i;

/** High-priority government domains — these specific entities warrant CRITICAL when combined with keywords. */
export const GOV_HIGH_PRIORITY_RE =
  /^.+@(?:pj|sunat|mpfn|tc|indecopi|sunarp|sbs|smv|osce|reniec|sunafil|mef|minjus|pcm|defensoria|contraloria|oefa|ana|ositran|osiptel|osinergmin|servir|susalud)\.gob\.pe$/i;

/** Short-form case numbers: e.g. Exp. N° 01234-2024 */
export const CASE_NUMBER_RE =
  /(?:Exp(?:ediente)?\.?\s*(?:N[°ºo.]?\s*)?)(\d{1,6}[-–/]\d{2,4})/gi;

/** Full Peruvian judicial case numbers: 00123-2024-0-1801-JR-CI-01 */
export const FULL_CASE_NUMBER_RE =
  /(\d{5}-\d{4}-\d{1,2}-\d{4}-[A-Z]{2}-[A-Z]{2}-\d{2})/g;

/** Relative deadlines: "dentro de 5 días hábiles", "Plazo: 10 días", "es de 5 días hábiles" */
export const RELATIVE_DEADLINE_RE =
  /(?:dentro\s+de|en\s+(?:el\s+)?(?:plazo|término)\s+de|plazo\s*(?:de|:)\s*|(?:es|será?)\s+de)\s*(\d{1,3})\s*(?:días?\s*(?:hábiles|calendario|útiles)?)/gi;

/** Absolute dates in Spanish: "15 de marzo de 2026" */
export const ABSOLUTE_DATE_RE =
  /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de(?:l)?\s+)?\d{4})/gi;

/** Peruvian tax ID (RUC): starts with 10, 15, 17, or 20 + 9 digits */
export const RUC_RE =
  /(?:RUC|R\.U\.C\.?)\s*(?:N[°ºo.]?\s*)?:?\s*((?:10|15|17|20)\d{9})/gi;

/** Monetary amounts in Peruvian Soles */
export const SOLES_RE =
  /S\/\.?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?)/g;

/** UIT references */
export const UIT_RE =
  /(\d{1,4}(?:\.\d{1,2})?)\s*(?:UIT|Unidades?\s+Impositivas?\s+Tributarias?)/gi;

/** Legal article / law references: "artículo 123", "ley N° 30225" */
export const LEGAL_REF_RE =
  /artículo\s+\d+|ley\s+n[°ºo.]?\s*\d+/gi;

// Subject-line scoring patterns
export const URGENCY_KW_RE =
  /\b(URGENTE|INMEDIATO|EMERGENCIA|PLAZO|VENCIMIENTO|PERENTORIO)\b/i;

export const LEGAL_PROCESS_RE =
  /\b(sentencia|resolución|notificación|citación|audiencia|embargo|requerimiento|apelación|casación|demanda|emplazamiento|auto admisorio)\b/i;

export const DEADLINE_KW_RE =
  /\b(plazo|vencimiento|fecha\s+límite|vence\s+el|antes\s+del)\b/i;

export const CASE_NUMBER_SUBJECT_RE =
  /Exp(?:ediente)?\.?\s*(?:N[°ºo.]?\s*)?\d+[-–\/]?\d*/i;

export const ACTION_REQUIRED_RE =
  /\b(firmar|aprobar|autorizar|confirmar|V°B°)\b/i;

export const FYI_MARKERS_RE =
  /\b(FYI|para\s+su\s+conocimiento|informativo|no\s+requiere\s+respuesta)\b/i;

// Content-body patterns
export const DEADLINE_BODY_RE =
  /(?:dentro\s+de|plazo\s*(?:de|:)\s*|(?:es|será?)\s+de)\s*\d+\s*días\s*(?:hábiles|calendario|útiles)?/i;

export const BAJO_APERCIBIMIENTO_RE =
  /bajo\s+apercibimiento/i;

export const ESCALATION_LANGUAGE_RE =
  /\b(escalar|jefe|supervisor|urgente|sin\s+respuesta)\b/i;

/** Legal attachment filenames */
export const LEGAL_ATTACHMENT_RE =
  /(resolución|sentencia|contrato|demanda|escritura|acta|poder)\.(pdf|docx?)/i;

// ---------------------------------------------------------------------------
// Critical and high keyword sets (for fast lookup)
// ---------------------------------------------------------------------------

/**
 * Any match in subject or first 200 chars of body forces score >= 8.0
 */
export const CRITICAL_KEYWORDS: string[] = [
  'URGENTE',
  'BAJO APERCIBIMIENTO',
  'EMBARGO',
  'MEDIDA CAUTELAR',
  'PRISIÓN PREVENTIVA',
  'DETENCIÓN',
  'COBRANZA COACTIVA',
  'ÚLTIMO DÍA',
  'PERENTORIO',
];

/** +2 to +3 each */
export const HIGH_KEYWORDS: string[] = [
  'SENTENCIA',
  'RESOLUCIÓN',
  'AUTO ADMISORIO',
  'NOTIFICACIÓN',
  'REQUERIMIENTO',
  'CITACIÓN',
  'EMPLAZAMIENTO',
  'DEMANDA',
  'CONTESTACIÓN',
  'RECURSO DE APELACIÓN',
  'RECURSO DE CASACIÓN',
  'AUDIENCIA',
  'VISTA DE CAUSA',
  'FISCALIZACIÓN',
  'RESOLUCIÓN DE DETERMINACIÓN',
  'EXPEDIENTE',
];

/** +1 to +2 each */
export const MEDIUM_KEYWORDS: string[] = [
  'CONTRATO',
  'ESCRITURA',
  'PODER',
  'ACTA',
  'INSCRIPCIÓN',
  'OBSERVACIÓN',
  'CERTIFICADO',
  'INFORME LEGAL',
  'DICTAMEN',
  'HONORARIOS',
  'FACTURA',
  'PRESUPUESTO',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the email address portion from a "Name <addr>" string. */
export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : raw.toLowerCase().trim();
}

/** Extract the domain from an email address or "Name <addr>" string. */
export function extractDomain(raw: string): string {
  const addr = extractEmailAddress(raw);
  const parts = addr.split('@');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * Map a numeric score to an urgency level.
 *
 * | Score       | Urgency      |
 * |-------------|--------------|
 * | >= 8.0      | critical     |
 * | 5.0 - 7.9   | high         |
 * | 3.0 - 4.9   | medium       |
 * | 0.0 - 2.9   | low          |
 * | < 0.0       | auto-archive |
 */
export function scoreToUrgency(score: number): Urgency {
  if (score >= 8.0) return 'critical';
  if (score >= 5.0) return 'high';
  if (score >= 3.0) return 'medium';
  if (score >= 0.0) return 'low';
  return 'auto-archive';
}

/**
 * Count question marks in text body to estimate question density.
 */
export function countQuestions(text: string): number {
  const matches = text.match(/\?/g);
  return matches ? matches.length : 0;
}

/**
 * Estimate the HTML-to-text ratio of a message.
 * High ratio (>3) is an indicator of marketing / newsletter content.
 */
export function htmlToTextRatio(bodyHtml: string | undefined, body: string): number {
  if (!bodyHtml) return 0;
  const htmlLen = bodyHtml.length;
  const textLen = body.length || 1;
  return htmlLen / textLen;
}

/**
 * Count URLs in an HTML body.
 */
export function countUrls(bodyHtml: string | undefined): number {
  if (!bodyHtml) return 0;
  const matches = bodyHtml.match(/https?:\/\/[^\s"'<>]+/gi);
  return matches ? matches.length : 0;
}

/**
 * Check whether an email appears to be a newsletter or marketing message.
 * Criteria: has unsubscribe indicator + noreply sender + high HTML ratio + many URLs.
 */
export function isNewsletter(email: EmailInput): boolean {
  const fromAddr = extractEmailAddress(email.from);
  const hasNoreply = /no[-_]?reply|noreply|mailer[-_]?daemon|bounce/i.test(fromAddr);

  const hasUnsubscribe =
    !!(email.headers?.['list-unsubscribe'] || email.headers?.['List-Unsubscribe']) ||
    (email.bodyHtml
      ? /unsubscribe|darse\s+de\s+baja|cancelar\s+suscripci[oó]n/i.test(email.bodyHtml)
      : false);

  const ratio = htmlToTextRatio(email.bodyHtml, email.body);
  const urlCount = countUrls(email.bodyHtml);

  // Need at least 2 of 4 signals, with unsubscribe being required
  if (!hasUnsubscribe) return false;
  let signals = 1; // unsubscribe already counts
  if (hasNoreply) signals++;
  if (ratio > 3) signals++;
  if (urlCount > 5) signals++;

  return signals >= 3;
}

// ---------------------------------------------------------------------------
// Entity extraction (runs on every email regardless of classification stage)
// ---------------------------------------------------------------------------

/**
 * Extract all structured legal entities from the combined subject + body text.
 * This runs for every email so the UI always has parsed metadata.
 */
export function extractEntities(email: EmailInput): ExtractedEntities {
  const fullText = `${email.subject}\n${email.body}`;

  const caseNumbers: string[] = [];

  // Full case numbers first (more specific)
  let m: RegExpExecArray | null;
  const fullCaseRe = new RegExp(FULL_CASE_NUMBER_RE.source, FULL_CASE_NUMBER_RE.flags);
  while ((m = fullCaseRe.exec(fullText)) !== null) {
    caseNumbers.push(m[1]);
  }

  // Short-form case numbers
  const shortCaseRe = new RegExp(CASE_NUMBER_RE.source, CASE_NUMBER_RE.flags);
  while ((m = shortCaseRe.exec(fullText)) !== null) {
    const num = m[1];
    // Avoid duplicates where the short form is a substring of an already-captured full form
    if (!caseNumbers.some((c) => c.includes(num))) {
      caseNumbers.push(num);
    }
  }

  // Absolute dates
  const dates: string[] = [];
  const dateRe = new RegExp(ABSOLUTE_DATE_RE.source, ABSOLUTE_DATE_RE.flags);
  while ((m = dateRe.exec(fullText)) !== null) {
    dates.push(m[1]);
  }

  // Relative deadlines
  const deadlines: string[] = [];
  const relDeadlineRe = new RegExp(RELATIVE_DEADLINE_RE.source, RELATIVE_DEADLINE_RE.flags);
  while ((m = relDeadlineRe.exec(fullText)) !== null) {
    deadlines.push(m[0]);
  }

  // Monetary amounts in soles
  const monetaryAmounts: string[] = [];
  const solesRe = new RegExp(SOLES_RE.source, SOLES_RE.flags);
  while ((m = solesRe.exec(fullText)) !== null) {
    monetaryAmounts.push(`S/. ${m[1]}`);
  }

  // UIT amounts
  const uitRe = new RegExp(UIT_RE.source, UIT_RE.flags);
  while ((m = uitRe.exec(fullText)) !== null) {
    monetaryAmounts.push(`${m[1]} UIT`);
  }

  // RUC numbers
  const rucs: string[] = [];
  const rucRe = new RegExp(RUC_RE.source, RUC_RE.flags);
  while ((m = rucRe.exec(fullText)) !== null) {
    rucs.push(m[1]);
  }

  // Legal references (articles and laws)
  const legalRefs: string[] = [];
  const legalRefRe = new RegExp(LEGAL_REF_RE.source, LEGAL_REF_RE.flags);
  while ((m = legalRefRe.exec(fullText)) !== null) {
    legalRefs.push(m[0]);
  }

  return { caseNumbers, dates, deadlines, monetaryAmounts, rucs, legalRefs };
}

// ---------------------------------------------------------------------------
// Stage 1: Fast Filter — hard rules, 100% confidence
// ---------------------------------------------------------------------------

/**
 * Stage 1 Rule: Government domain sender.
 * Any email from a *.gob.pe judicial/regulatory domain is at least HIGH;
 * combined with deadline or sentencia/resolucion keywords it is CRITICAL.
 */
export function ruleGovDomain(email: EmailInput): TriageFactor[] {
  const factors: TriageFactor[] = [];
  const addr = extractEmailAddress(email.from);

  if (!GOV_DOMAIN_RE.test(addr)) return factors;

  const domain = extractDomain(email.from);
  const isHighPriority = GOV_HIGH_PRIORITY_RE.test(addr);

  // Check for CRITICAL combos (any gov domain + legal keywords)
  const hasDeadlineKw = DEADLINE_KW_RE.test(email.subject);
  const hasSentenciaResolucion = /SENTENCIA|RESOLUCIÓN|RESOLUCION/i.test(email.subject);
  const hasAudiencia = /AUDIENCIA|CITACIÓN|NOTIFICACIÓN/i.test(email.subject);
  const hasCaseNumber = CASE_NUMBER_SUBJECT_RE.test(email.subject);
  const hasLegalProcess = LEGAL_PROCESS_RE.test(email.subject);

  if (hasDeadlineKw) {
    factors.push({
      category: 'sender',
      rule: 'gov_domain_deadline_combo',
      score: 10,
      detail: `Government domain ${domain} + deadline keyword in subject`,
    });
  } else if (hasSentenciaResolucion) {
    factors.push({
      category: 'sender',
      rule: 'gov_domain_sentencia_combo',
      score: 10,
      detail: `Government domain ${domain} + SENTENCIA/RESOLUCIÓN in subject`,
    });
  } else if (hasAudiencia || (hasLegalProcess && hasCaseNumber)) {
    // Audiencia/citación from gov domain, or legal process + case number = CRITICAL
    factors.push({
      category: 'sender',
      rule: 'gov_domain_legal_combo',
      score: 9,
      detail: `Government domain ${domain} + legal process term in subject`,
    });
  } else if (isHighPriority) {
    // High-priority government entity (PJ, SUNAT, INDECOPI, etc.) without specific keywords
    factors.push({
      category: 'sender',
      rule: 'gov_domain_high_priority',
      score: 7,
      detail: `High-priority government entity: ${domain}`,
    });
  } else {
    // Any other .gob.pe domain — still at least HIGH-ish
    factors.push({
      category: 'sender',
      rule: 'gov_domain',
      score: 5.5,
      detail: `Sender from government domain: ${domain}`,
    });
  }

  return factors;
}

/**
 * Stage 1 Rule: Newsletter / marketing detection.
 * Combination of unsubscribe + noreply + high HTML ratio + many URLs.
 */
export function ruleNewsletter(email: EmailInput): TriageFactor[] {
  if (!isNewsletter(email)) return [];

  return [
    {
      category: 'sender',
      rule: 'newsletter_marketing',
      score: -5,
      detail: 'Detected as newsletter/marketing: unsubscribe link, noreply sender, high HTML ratio, many URLs',
    },
  ];
}

/**
 * Stage 1 Rule: VIP sender.
 * Email address or domain matches the configured VIP list.
 */
export function ruleVipSender(
  email: EmailInput,
  vipSenders?: string[],
): TriageFactor[] {
  if (!vipSenders || vipSenders.length === 0) return [];

  const addr = extractEmailAddress(email.from);
  const domain = extractDomain(email.from);

  for (const vip of vipSenders) {
    const vipLower = vip.toLowerCase();
    // Match by exact email or by domain
    if (addr === vipLower || domain === vipLower) {
      return [
        {
          category: 'sender',
          rule: 'vip_sender',
          score: 7,
          detail: `Sender matches VIP list: ${vip}`,
        },
      ];
    }
  }

  return [];
}

/**
 * Stage 1 Rule: Known client.
 * Match sender against the known-clients list; tag with case ID if available.
 */
export function ruleKnownClient(
  email: EmailInput,
  knownClients?: TriageContext['knownClients'],
): { factors: TriageFactor[]; suggestedCaseId?: string } {
  if (!knownClients || knownClients.length === 0) return { factors: [] };

  const addr = extractEmailAddress(email.from);

  for (const client of knownClients) {
    if (addr === client.email.toLowerCase()) {
      return {
        factors: [
          {
            category: 'sender',
            rule: 'known_client',
            score: 5,
            detail: `Known client: ${client.name}${client.caseId ? ` (Case: ${client.caseId})` : ''}`,
          },
        ],
        suggestedCaseId: client.caseId,
      };
    }
  }

  return { factors: [] };
}

/**
 * Stage 1 Rule: Archive pattern.
 * If sender email or domain matches any configured archive rule, auto-archive.
 */
export function ruleArchivePattern(email: EmailInput, archiveRules?: ArchiveRule[]): TriageFactor[] {
  if (!archiveRules || archiveRules.length === 0) return [];

  const addr = extractEmailAddress(email.from);
  const domain = extractDomain(email.from);

  for (const rule of archiveRules) {
    const pattern = rule.pattern.toLowerCase();
    if (addr === pattern || addr.includes(pattern) || domain === pattern) {
      return [
        {
          category: 'sender',
          rule: 'archive_pattern',
          score: -5,
          detail: `Sender matches archive rule: "${rule.pattern}" (${rule.type})`,
        },
      ];
    }
  }

  return [];
}

/**
 * Stage 2 Rule: Sender reputation from learned scores.
 * Maps a 0-10 reputation score to a 0-3 contribution.
 */
export function ruleSenderReputation(email: EmailInput, senderScores?: SenderScore[]): TriageFactor[] {
  if (!senderScores || senderScores.length === 0) return [];

  const addr = extractEmailAddress(email.from);
  const entry = senderScores.find(s => s.email.toLowerCase() === addr);
  if (!entry) return [];

  const contribution = Math.min(3, entry.score * 0.3);

  return [
    {
      category: 'sender',
      rule: 'sender_reputation',
      score: Math.round(contribution * 10) / 10,
      detail: `Sender reputation score: ${entry.score.toFixed(1)} (contribution: ${contribution.toFixed(1)})`,
    },
  ];
}

/**
 * Run all Stage 1 rules. If any rule produces a result with 100% confidence,
 * the function returns a complete TriageResult. Otherwise returns null to
 * signal that Stage 2 should execute.
 */
export function runStage1(
  email: EmailInput,
  context?: TriageContext,
): TriageResult | null {
  const entities = extractEntities(email);

  // --- Government domain (highest priority) ---
  const govFactors = ruleGovDomain(email);
  if (govFactors.length > 0) {
    const totalScore = govFactors.reduce((s, f) => s + f.score, 0);
    return {
      urgency: scoreToUrgency(totalScore),
      score: totalScore,
      confidence: 1.0,
      stage: 1,
      factors: govFactors,
      extractedEntities: entities,
    };
  }

  // --- VIP sender (checked BEFORE newsletter — a VIP using noreply should not be archived) ---
  const vipFactors = ruleVipSender(email, context?.vipSenders);
  if (vipFactors.length > 0) {
    const totalScore = vipFactors.reduce((s, f) => s + f.score, 0);
    return {
      urgency: scoreToUrgency(totalScore),
      score: totalScore,
      confidence: 1.0,
      stage: 1,
      factors: vipFactors,
      extractedEntities: entities,
    };
  }

  // --- Known client (checked BEFORE newsletter — client emails must never be archived) ---
  const clientResult = ruleKnownClient(email, context?.knownClients);
  if (clientResult.factors.length > 0) {
    const totalScore = clientResult.factors.reduce((s, f) => s + f.score, 0);
    return {
      urgency: scoreToUrgency(totalScore),
      score: totalScore,
      confidence: 1.0,
      stage: 1,
      factors: clientResult.factors,
      extractedEntities: entities,
      suggestedCaseId: clientResult.suggestedCaseId,
    };
  }

  // --- Newsletter / marketing (after VIP/client checks) ---
  const nlFactors = ruleNewsletter(email);
  if (nlFactors.length > 0) {
    return {
      urgency: 'auto-archive',
      score: nlFactors[0].score,
      confidence: 1.0,
      stage: 1,
      factors: nlFactors,
      extractedEntities: entities,
    };
  }

  // --- Archive pattern (user-configured) ---
  const archiveFactors = ruleArchivePattern(email, context?.archiveRules);
  if (archiveFactors.length > 0) {
    return {
      urgency: 'auto-archive',
      score: archiveFactors[0].score,
      confidence: 1.0,
      stage: 1,
      factors: archiveFactors,
      extractedEntities: entities,
    };
  }

  // VIP and known client already checked above — fall through to Stage 2

  return null; // Stage 1 did not resolve — proceed to Stage 2
}

// ---------------------------------------------------------------------------
// Stage 2: Heuristic scoring — weighted rules across 7 categories
// ---------------------------------------------------------------------------

// ---- Category: Critical Keywords ----

/**
 * Scan subject and first 200 chars of body for critical keywords.
 * Any single match forces score >= 8.0 (CRITICAL).
 */
export function ruleCriticalKeywords(email: EmailInput, customKeywords?: KeywordEntry[]): TriageFactor[] {
  const factors: TriageFactor[] = [];
  const searchArea = `${email.subject}\n${email.body.slice(0, 1000)}`.toUpperCase();

  if (customKeywords && customKeywords.length > 0) {
    for (const entry of customKeywords) {
      if (searchArea.includes(entry.keyword.toUpperCase())) {
        factors.push({
          category: 'critical_keyword',
          rule: 'critical_keyword_match',
          score: entry.weight,
          detail: `Critical keyword found: "${entry.keyword}"`,
        });
        return factors;
      }
    }
  } else {
    for (const kw of CRITICAL_KEYWORDS) {
      // Use word-boundary-aware matching; for multi-word keywords check substring
      if (searchArea.includes(kw.toUpperCase())) {
        factors.push({
          category: 'critical_keyword',
          rule: 'critical_keyword_match',
          score: 8,
          detail: `Critical keyword found: "${kw}"`,
        });
        // One critical keyword is enough to force CRITICAL — no need to stack
        return factors;
      }
    }
  }

  return factors;
}

// ---- Category: Subject Line Signals ----

/**
 * Subject: urgency keywords (URGENTE, INMEDIATO, EMERGENCIA, etc.)
 */
export function ruleSubjectUrgency(email: EmailInput): TriageFactor[] {
  const match = email.subject.match(URGENCY_KW_RE);
  if (!match) return [];
  return [
    {
      category: 'subject',
      rule: 'urgency_keyword',
      score: 3,
      detail: `Urgency keyword in subject: "${match[1]}"`,
    },
  ];
}

/**
 * Subject: legal process terms (sentencia, resolución, notificación, etc.)
 */
export function ruleSubjectLegalProcess(email: EmailInput): TriageFactor[] {
  const match = email.subject.match(LEGAL_PROCESS_RE);
  if (!match) return [];
  return [
    {
      category: 'subject',
      rule: 'legal_process',
      score: 3,
      detail: `Legal process term in subject: "${match[1]}"`,
    },
  ];
}

/**
 * Subject: deadline keywords
 */
export function ruleSubjectDeadline(email: EmailInput): TriageFactor[] {
  const match = email.subject.match(DEADLINE_KW_RE);
  if (!match) return [];
  return [
    {
      category: 'subject',
      rule: 'deadline_keyword',
      score: 2.5,
      detail: `Deadline keyword in subject: "${match[1]}"`,
    },
  ];
}

/**
 * Subject: case number reference
 */
export function ruleSubjectCaseNumber(email: EmailInput): TriageFactor[] {
  if (!CASE_NUMBER_SUBJECT_RE.test(email.subject)) return [];
  return [
    {
      category: 'subject',
      rule: 'case_number_in_subject',
      score: 2,
      detail: 'Case number reference found in subject',
    },
  ];
}

/**
 * Subject: action required (firmar, aprobar, autorizar, confirmar, V.B.)
 */
export function ruleSubjectActionRequired(email: EmailInput): TriageFactor[] {
  const match = email.subject.match(ACTION_REQUIRED_RE);
  if (!match) return [];
  return [
    {
      category: 'subject',
      rule: 'action_required',
      score: 2,
      detail: `Action required in subject: "${match[1]}"`,
    },
  ];
}

/**
 * Subject: FYI / informational markers (negative score)
 */
export function ruleSubjectFyi(email: EmailInput): TriageFactor[] {
  const match = email.subject.match(FYI_MARKERS_RE);
  if (!match) return [];
  return [
    {
      category: 'subject',
      rule: 'fyi_marker',
      score: -2,
      detail: `FYI/informational marker in subject: "${match[1]}"`,
    },
  ];
}

/**
 * Subject: HIGH keywords (+2 to +3 each)
 */
export function ruleSubjectHighKeywords(email: EmailInput, customKeywords?: KeywordEntry[]): TriageFactor[] {
  const factors: TriageFactor[] = [];
  const subjectUpper = email.subject.toUpperCase();

  if (customKeywords && customKeywords.length > 0) {
    for (const entry of customKeywords) {
      if (subjectUpper.includes(entry.keyword.toUpperCase())) {
        factors.push({
          category: 'subject',
          rule: 'high_keyword',
          score: entry.weight,
          detail: `High-priority keyword in subject: "${entry.keyword}"`,
        });
      }
    }
  } else {
    for (const kw of HIGH_KEYWORDS) {
      if (subjectUpper.includes(kw)) {
        factors.push({
          category: 'subject',
          rule: 'high_keyword',
          score: 2.5,
          detail: `High-priority keyword in subject: "${kw}"`,
        });
      }
    }
  }
  return factors;
}

/**
 * Subject: MEDIUM keywords (+1 to +2 each)
 */
export function ruleSubjectMediumKeywords(email: EmailInput, customKeywords?: KeywordEntry[]): TriageFactor[] {
  const factors: TriageFactor[] = [];
  const subjectUpper = email.subject.toUpperCase();

  if (customKeywords && customKeywords.length > 0) {
    for (const entry of customKeywords) {
      if (subjectUpper.includes(entry.keyword.toUpperCase())) {
        factors.push({
          category: 'subject',
          rule: 'medium_keyword',
          score: entry.weight,
          detail: `Medium-priority keyword in subject: "${entry.keyword}"`,
        });
      }
    }
  } else {
    for (const kw of MEDIUM_KEYWORDS) {
      if (subjectUpper.includes(kw)) {
        factors.push({
          category: 'subject',
          rule: 'medium_keyword',
          score: 1.5,
          detail: `Medium-priority keyword in subject: "${kw}"`,
        });
      }
    }
  }
  return factors;
}

// ---- Category: Sender Signals ----

/**
 * Sender: historical average priority.
 * If the sender has a known track record, add their average priority as a
 * score offset (0-10 scale mapped to 0-3 contribution).
 */
export function ruleSenderHistory(
  email: EmailInput,
  senderHistory?: TriageContext['senderHistory'],
): TriageFactor[] {
  if (!senderHistory || senderHistory.length === 0) return [];

  const addr = extractEmailAddress(email.from);
  const entry = senderHistory.find((h) => h.email.toLowerCase() === addr);
  if (!entry) return [];

  // Map avgPriority (assume 0-10 scale) into a 0-3 contribution
  const contribution = Math.min(3, entry.avgPriority * 0.3);

  return [
    {
      category: 'sender',
      rule: 'sender_history_avg',
      score: Math.round(contribution * 10) / 10,
      detail: `Historical avg priority: ${entry.avgPriority.toFixed(1)} (${entry.emailCount} emails)`,
    },
  ];
}

/**
 * Sender: frequency anomaly.
 * An infrequent sender (<5 emails in history) from a legal domain gets a boost.
 */
export function ruleSenderFrequencyAnomaly(
  email: EmailInput,
  senderHistory?: TriageContext['senderHistory'],
): TriageFactor[] {
  if (!senderHistory || senderHistory.length === 0) return [];

  const addr = extractEmailAddress(email.from);
  const domain = extractDomain(email.from);
  const entry = senderHistory.find((h) => h.email.toLowerCase() === addr);

  const isLegalDomain =
    GOV_DOMAIN_RE.test(addr) ||
    /\.(gob\.pe|org\.pe)$/i.test(domain) ||
    /abogad|legal|juridi|notari|estudio/i.test(domain);

  if (isLegalDomain && (!entry || entry.emailCount < 5)) {
    return [
      {
        category: 'sender',
        rule: 'frequency_anomaly',
        score: 1.5,
        detail: `Infrequent sender from legal domain: ${domain}${entry ? ` (${entry.emailCount} prior emails)` : ' (first contact)'}`,
      },
    ];
  }

  return [];
}

/**
 * Sender: organizational rank in signature or display name.
 * Socio, Director, Gerente, etc.
 */
export function ruleSenderRank(email: EmailInput): TriageFactor[] {
  const fromField = email.from;
  const rankRe = /\b(Socio|Director[a]?|Gerente|Presidente|Jefe|Magistrad[oa]|Juez[a]?|Fiscal)\b/i;
  const match = fromField.match(rankRe);
  if (!match) return [];

  return [
    {
      category: 'sender',
      rule: 'organizational_rank',
      score: 1,
      detail: `Sender rank detected: "${match[1]}"`,
    },
  ];
}

/**
 * Sender: rapid succession (3+ emails from same sender in <1h).
 * This is approximated by checking senderHistory lastSeen vs current email date.
 */
export function ruleSenderRapidSuccession(
  email: EmailInput,
  senderHistory?: TriageContext['senderHistory'],
): TriageFactor[] {
  if (!senderHistory || senderHistory.length === 0) return [];

  const addr = extractEmailAddress(email.from);
  const entry = senderHistory.find((h) => h.email.toLowerCase() === addr);
  if (!entry) return [];

  const emailDate = new Date(email.date).getTime();
  const lastSeen = new Date(entry.lastSeen).getTime();

  if (isNaN(emailDate) || isNaN(lastSeen)) return [];

  const hourMs = 60 * 60 * 1000;
  const timeDiff = emailDate - lastSeen;

  // If last email was less than 1 hour ago and they send frequently, flag escalation
  if (timeDiff > 0 && timeDiff < hourMs && entry.emailCount >= 3) {
    return [
      {
        category: 'sender',
        rule: 'rapid_succession',
        score: 3,
        detail: `Rapid succession: ${entry.emailCount} emails, last seen ${Math.round(timeDiff / 60000)}min ago`,
      },
    ];
  }

  return [];
}

// ---- Category: Temporal Signals ----

/**
 * Temporal: email sent outside business hours (before 8am / after 7pm Lima time).
 * Late-night/early-morning sends from legal senders are often urgent.
 */
export function ruleTemporalOutsideHours(email: EmailInput): TriageFactor[] {
  const d = new Date(email.date);
  if (isNaN(d.getTime())) return [];

  // Convert to Lima time (UTC-5, Peru does not observe DST)
  const utcHour = d.getUTCHours();
  const limaHour = (utcHour - 5 + 24) % 24;

  if (limaHour < 8 || limaHour >= 19) {
    return [
      {
        category: 'temporal',
        rule: 'outside_business_hours',
        score: 1,
        detail: `Sent outside business hours (Lima time: ${limaHour}:00)`,
      },
    ];
  }

  return [];
}

/**
 * Temporal: email arrives within 48h of a filing deadline in the system.
 * Returns CRITICAL override.
 */
export function ruleTemporalDeadlineProximity(
  email: EmailInput,
  activeDeadlines?: TriageContext['activeDeadlines'],
  entities?: ExtractedEntities,
): TriageFactor[] {
  if (!activeDeadlines || activeDeadlines.length === 0) return [];

  const factors: TriageFactor[] = [];
  const emailDate = new Date(email.date).getTime();
  if (isNaN(emailDate)) return [];

  const fortyEightHours = 48 * 60 * 60 * 1000;
  const seventyTwoHours = 72 * 60 * 60 * 1000;

  // Check if any extracted case number matches an active deadline
  const caseNumbers = entities?.caseNumbers ?? [];
  const fullText = `${email.subject}\n${email.body}`.toLowerCase();

  for (const dl of activeDeadlines) {
    const deadlineDate = new Date(dl.deadline).getTime();
    if (isNaN(deadlineDate)) continue;

    const timeToDeadline = deadlineDate - emailDate;
    if (timeToDeadline < 0) continue; // deadline already passed

    // Check if the email references the same case
    const caseMatch =
      (dl.caseNumber && caseNumbers.some((cn) => cn.includes(dl.caseNumber!))) ||
      fullText.includes(dl.caseName.toLowerCase());

    if (!caseMatch) continue;

    if (timeToDeadline <= fortyEightHours) {
      factors.push({
        category: 'temporal',
        rule: 'within_48h_deadline',
        score: 10,
        detail: `Email references case "${dl.caseName}" with deadline in ${Math.round(timeToDeadline / 3600000)}h — CRITICAL override`,
      });
      return factors; // One critical override is sufficient
    }

    if (timeToDeadline <= seventyTwoHours) {
      factors.push({
        category: 'temporal',
        rule: 'within_72h_hearing',
        score: 10,
        detail: `Email references case "${dl.caseName}" with hearing/deadline in ${Math.round(timeToDeadline / 3600000)}h — CRITICAL override`,
      });
      return factors;
    }
  }

  return factors;
}

// ---- Category: Structural Signals ----

/**
 * Structural: TO/CC/BCC position of the user.
 * Direct TO (sole recipient) = +2; CC = -1; BCC = -0.5.
 */
export function ruleStructuralRecipientPosition(email: EmailInput): TriageFactor[] {
  const factors: TriageFactor[] = [];

  if (email.to.length === 1) {
    factors.push({
      category: 'structural',
      rule: 'sole_recipient',
      score: 2,
      detail: 'User is the sole direct recipient (TO)',
    });
  } else if (email.to.length > 1) {
    // Still in TO, but shared — smaller boost
    factors.push({
      category: 'structural',
      rule: 'to_multi_recipient',
      score: 1,
      detail: `One of ${email.to.length} direct recipients`,
    });
  }

  if (email.cc && email.cc.length > 0) {
    // The user might be in CC rather than TO — check total recipient count
    const totalRecipients = email.to.length + email.cc.length + (email.bcc?.length ?? 0);
    if (totalRecipients > 10) {
      factors.push({
        category: 'structural',
        rule: 'mass_recipient',
        score: -1,
        detail: `Mass email: ${totalRecipients} total recipients`,
      });
    }
  }

  return factors;
}

/**
 * Structural: CC penalty.
 * If the email has CC recipients, it is less likely to require direct action.
 */
export function ruleStructuralCc(email: EmailInput): TriageFactor[] {
  if (!email.cc || email.cc.length === 0) return [];

  return [
    {
      category: 'structural',
      rule: 'cc_present',
      score: -1,
      detail: `Email has ${email.cc.length} CC recipients`,
    },
  ];
}

/**
 * Structural: BCC penalty.
 */
export function ruleStructuralBcc(email: EmailInput): TriageFactor[] {
  if (!email.bcc || email.bcc.length === 0) return [];

  return [
    {
      category: 'structural',
      rule: 'bcc_present',
      score: -0.5,
      detail: `User is BCC'd on this email`,
    },
  ];
}

/**
 * Structural: legal attachments by filename.
 */
export function ruleStructuralLegalAttachments(email: EmailInput): TriageFactor[] {
  if (!email.attachments || email.attachments.length === 0) return [];

  const factors: TriageFactor[] = [];

  for (const att of email.attachments) {
    if (LEGAL_ATTACHMENT_RE.test(att.filename)) {
      factors.push({
        category: 'structural',
        rule: 'legal_attachment',
        score: 2,
        detail: `Legal attachment detected: "${att.filename}"`,
      });
      break; // Count only once to avoid over-scoring
    }
  }

  return factors;
}

/**
 * Structural: read-receipt header requested.
 */
export function ruleStructuralReadReceipt(email: EmailInput): TriageFactor[] {
  if (!email.headers) return [];

  const hasReadReceipt =
    !!email.headers['disposition-notification-to'] ||
    !!email.headers['Disposition-Notification-To'] ||
    !!email.headers['return-receipt-to'] ||
    !!email.headers['Return-Receipt-To'];

  if (!hasReadReceipt) return [];

  return [
    {
      category: 'structural',
      rule: 'read_receipt_requested',
      score: 1,
      detail: 'Sender requested read receipt',
    },
  ];
}

/**
 * Structural: X-Priority header.
 * X-Priority: 1 (Highest) = +1.5
 */
export function ruleStructuralXPriority(email: EmailInput): TriageFactor[] {
  if (!email.headers) return [];

  const xPriority =
    email.headers['x-priority'] ||
    email.headers['X-Priority'] ||
    email.headers['X-MSMail-Priority'];

  if (!xPriority) return [];

  const priority = parseInt(xPriority.trim(), 10);
  if (priority === 1) {
    return [
      {
        category: 'structural',
        rule: 'x_priority_highest',
        score: 1.5,
        detail: 'X-Priority: 1 (Highest) set by sender',
      },
    ];
  }

  if (priority === 5) {
    return [
      {
        category: 'structural',
        rule: 'x_priority_lowest',
        score: -1,
        detail: 'X-Priority: 5 (Lowest) set by sender',
      },
    ];
  }

  return [];
}

// ---- Category: Content Signals (body text, no LLM) ----

/**
 * Content: deadline phrases in body ("dentro de N dias habiles")
 */
export function ruleContentDeadlineBody(email: EmailInput): TriageFactor[] {
  if (!DEADLINE_BODY_RE.test(email.body)) return [];

  return [
    {
      category: 'content',
      rule: 'deadline_in_body',
      score: 3,
      detail: 'Deadline phrase found in body (e.g. "dentro de N dias")',
    },
  ];
}

/**
 * Content: legal article/law references.
 */
export function ruleContentLegalRefs(email: EmailInput): TriageFactor[] {
  const re = new RegExp(LEGAL_REF_RE.source, LEGAL_REF_RE.flags);
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(email.body)) !== null) {
    matches.push(m[0]);
    if (matches.length >= 3) break; // cap for performance
  }

  if (matches.length === 0) return [];

  return [
    {
      category: 'content',
      rule: 'legal_references',
      score: 1.5,
      detail: `Legal references found: ${matches.join(', ')}`,
    },
  ];
}

/**
 * Content: "bajo apercibimiento" — always CRITICAL.
 */
export function ruleContentBajoApercibimiento(email: EmailInput): TriageFactor[] {
  const fullText = `${email.subject}\n${email.body}`;

  if (!BAJO_APERCIBIMIENTO_RE.test(fullText)) return [];

  return [
    {
      category: 'content',
      rule: 'bajo_apercibimiento',
      score: 8,
      detail: '"Bajo apercibimiento" found — forced CRITICAL',
    },
  ];
}

/**
 * Content: question density. 3+ questions = +1 each, max +3.
 */
export function ruleContentQuestionDensity(email: EmailInput): TriageFactor[] {
  const count = countQuestions(email.body);
  if (count < 3) return [];

  const bonus = Math.min(3, count - 2); // 3 questions = +1, 4 = +2, 5+ = +3

  return [
    {
      category: 'content',
      rule: 'question_density',
      score: bonus,
      detail: `${count} questions detected in body (+${bonus})`,
    },
  ];
}

/**
 * Content: monetary amounts in body.
 */
export function ruleContentMonetaryAmounts(email: EmailInput): TriageFactor[] {
  if (SOLES_RE.test(email.body) || UIT_RE.test(email.body)) {
    return [
      {
        category: 'content',
        rule: 'monetary_amount',
        score: 1,
        detail: 'Monetary amount (S/. or UIT) found in body',
      },
    ];
  }
  return [];
}

// ---- Category: Thread Signals ----

/**
 * Thread: rapid back-and-forth (>4 replies in 2h approximation).
 * Since we may not have full timestamps, we use threadMessages count as a proxy.
 */
export function ruleThreadRapidReplies(email: EmailInput): TriageFactor[] {
  if (!email.threadMessages || email.threadMessages <= 4) return [];

  return [
    {
      category: 'thread',
      rule: 'rapid_back_and_forth',
      score: 2,
      detail: `Active thread: ${email.threadMessages} messages in conversation`,
    },
  ];
}

/**
 * Thread: new participants added to the thread.
 * If threadParticipants > to + cc of the original, new people joined.
 */
export function ruleThreadNewParticipants(email: EmailInput): TriageFactor[] {
  if (!email.threadParticipants) return [];

  const originalCount =
    email.to.length + (email.cc?.length ?? 0);
  const threadCount = email.threadParticipants.length;

  if (threadCount > originalCount + 1) {
    return [
      {
        category: 'thread',
        rule: 'new_participants',
        score: 1,
        detail: `Thread has ${threadCount} participants (original had ~${originalCount})`,
      },
    ];
  }

  return [];
}

/**
 * Thread: escalation language in body.
 */
export function ruleThreadEscalation(email: EmailInput): TriageFactor[] {
  const match = email.body.match(ESCALATION_LANGUAGE_RE);
  if (!match) return [];

  return [
    {
      category: 'thread',
      rule: 'escalation_language',
      score: 2,
      detail: `Escalation language detected: "${match[1]}"`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Stage 2 orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all Stage 2 heuristic rules and accumulate scores.
 * Returns the TriageResult with all contributing factors.
 */
export function runStage2(
  email: EmailInput,
  context?: TriageContext,
  precomputedEntities?: ExtractedEntities,
): TriageResult {
  const entities = precomputedEntities ?? extractEntities(email);
  const factors: TriageFactor[] = [];

  // --- Critical keywords (supersedes everything) ---
  factors.push(...ruleCriticalKeywords(email, context?.userKeywords?.critical));

  // --- Subject line signals ---
  factors.push(...ruleSubjectUrgency(email));
  factors.push(...ruleSubjectLegalProcess(email));
  factors.push(...ruleSubjectDeadline(email));
  factors.push(...ruleSubjectCaseNumber(email));
  factors.push(...ruleSubjectActionRequired(email));
  factors.push(...ruleSubjectFyi(email));
  factors.push(...ruleSubjectHighKeywords(email, context?.userKeywords?.high));
  factors.push(...ruleSubjectMediumKeywords(email, context?.userKeywords?.medium));

  // --- Sender signals ---
  factors.push(...ruleSenderHistory(email, context?.senderHistory));
  factors.push(...ruleSenderFrequencyAnomaly(email, context?.senderHistory));
  factors.push(...ruleSenderRank(email));
  factors.push(...ruleSenderRapidSuccession(email, context?.senderHistory));
  factors.push(...ruleSenderReputation(email, context?.senderScores));

  // --- Temporal signals ---
  factors.push(...ruleTemporalOutsideHours(email));
  factors.push(...ruleTemporalDeadlineProximity(email, context?.activeDeadlines, entities));

  // --- Structural signals ---
  factors.push(...ruleStructuralRecipientPosition(email));
  factors.push(...ruleStructuralCc(email));
  factors.push(...ruleStructuralBcc(email));
  factors.push(...ruleStructuralLegalAttachments(email));
  factors.push(...ruleStructuralReadReceipt(email));
  factors.push(...ruleStructuralXPriority(email));

  // --- Content signals ---
  factors.push(...ruleContentDeadlineBody(email));
  factors.push(...ruleContentLegalRefs(email));
  factors.push(...ruleContentBajoApercibimiento(email));
  factors.push(...ruleContentQuestionDensity(email));
  factors.push(...ruleContentMonetaryAmounts(email));

  // --- Thread signals ---
  factors.push(...ruleThreadRapidReplies(email));
  factors.push(...ruleThreadNewParticipants(email));
  factors.push(...ruleThreadEscalation(email));

  // --- Apply keyword adjustments from learning loop ---
  if (context?.keywordAdjustments?.length) {
    for (const factor of factors) {
      if (factor.rule.includes('keyword')) {
        const adj = context.keywordAdjustments.find(a =>
          factor.detail.toLowerCase().includes(a.keyword.toLowerCase())
        );
        if (adj) {
          factor.score += adj.weightModifier;
          factor.detail += ` [adjusted ${adj.weightModifier > 0 ? '+' : ''}${adj.weightModifier.toFixed(1)} from ${adj.sampleCount} corrections]`;
        }
      }
    }
  }

  // --- Accumulate total score ---
  const totalScore = factors.reduce((sum, f) => sum + f.score, 0);

  // --- Sentiment analysis ---
  // --- Sentiment analysis (cap body length to prevent slow processing) ---
  const bodyForSentiment = email.body.length > 5000 ? email.body.slice(0, 5000) : email.body;
  const sentiment = analyzeSentiment(bodyForSentiment);
  const adjustedScore = totalScore + sentiment.urgencyModifier;

  // --- Factor agreement for FIS (score-weighted, not just count-based) ---
  const positiveScoreSum = factors.filter(f => f.score > 0).reduce((s, f) => s + f.score, 0);
  const totalScoreAbs = factors.reduce((s, f) => s + Math.abs(f.score), 0) || 1;
  const factorAgreement = Math.min(1, positiveScoreSum / totalScoreAbs);

  // --- Sender reputation for FIS ---
  const senderAddr = extractEmailAddress(email.from);
  const senderDomain = extractDomain(email.from);
  // Unknown gov senders default to 7 (not neutral 5), other unknowns default to 5
  const isGovSender = GOV_DOMAIN_RE.test(senderAddr);
  const defaultRep = isGovSender ? 7 : 5;
  const senderRep = context?.senderScores?.find(s => s.email.toLowerCase() === senderAddr)?.score ?? defaultRep;

  // --- Fuzzy inference system ---
  const fisResult = fuzzyClassify({
    rawScore: adjustedScore,
    sentimentModifier: sentiment.urgencyModifier,
    senderReputation: senderRep,
    factorAgreement,
  });

  // --- Suggest a case ID if extracted case numbers match active deadlines ---
  const suggestedCaseId = matchCaseId(entities, context?.activeDeadlines);

  return {
    urgency: fisResult.urgency,
    score: Math.round(adjustedScore * 10) / 10,
    confidence: fisResult.confidence,
    stage: 2,
    factors,
    extractedEntities: entities,
    suggestedCaseId,
    sentiment: {
      polarity: sentiment.polarity,
      urgencyModifier: sentiment.urgencyModifier,
      emotions: {
        anger: sentiment.emotions.anger,
        fear: sentiment.emotions.fear,
        joy: sentiment.emotions.joy,
      },
    },
    fisOutput: {
      memberships: fisResult.memberships,
      firedRules: fisResult.firedRules.map(r => ({
        description: r.description,
        strength: r.strength,
        output: r.output,
      })),
    },
  };
}

/**
 * Compute confidence for Stage 2 results.
 *
 * Heuristic:
 * - If a critical keyword or bajo_apercibimiento was found: 0.95
 * - If score > 8 with 3+ factors: 0.9
 * - If score 5-8 with 2+ factors: 0.75
 * - Otherwise: scaled by factor count (0.4 base + 0.05 per factor, max 0.85)
 */
export function computeStage2Confidence(
  factors: TriageFactor[],
  totalScore: number,
): number {
  const hasCriticalKw = factors.some(
    (f) =>
      f.rule === 'critical_keyword_match' || f.rule === 'bajo_apercibimiento',
  );

  if (hasCriticalKw) return 0.95;

  const positiveFactors = factors.filter((f) => f.score > 0).length;

  if (totalScore >= 8 && positiveFactors >= 3) return 0.9;
  if (totalScore >= 5 && positiveFactors >= 2) return 0.75;
  if (totalScore < 0) {
    // Auto-archive confidence scales with how negative the score is
    return Math.min(0.85, 0.5 + Math.abs(totalScore) * 0.05);
  }

  return Math.min(0.85, 0.4 + positiveFactors * 0.05);
}

/**
 * Try to match extracted case numbers to an active deadline to suggest a case ID.
 */
export function matchCaseId(
  entities: ExtractedEntities,
  activeDeadlines?: TriageContext['activeDeadlines'],
): string | undefined {
  if (!activeDeadlines || activeDeadlines.length === 0) return undefined;
  if (entities.caseNumbers.length === 0) return undefined;

  for (const dl of activeDeadlines) {
    if (!dl.caseNumber) continue;
    // Normalize: extract just the numeric part (e.g., "01234-2024" from full format)
    const dlNums = dl.caseNumber.replace(/[^0-9\-–\/]/g, '');
    for (const cn of entities.caseNumbers) {
      const cnNums = cn.replace(/[^0-9\-–\/]/g, '');
      // Exact match on numeric portion, or one is the tail of the other (short vs full format)
      if (cnNums === dlNums || dlNums.endsWith(cnNums) || cnNums.endsWith(dlNums)) {
        return dl.caseId;
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Triage an email through the two-stage heuristic engine.
 *
 * **Stage 1** (Fast Filter, <1ms): applies hard rules based on domain, headers,
 * and VIP/client lists. Returns immediately with 100% confidence when matched.
 *
 * **Stage 2** (Heuristic Scoring, <10ms): runs 30+ weighted rules across 7
 * categories and accumulates a SpamAssassin-style score.
 *
 * Entities (case numbers, dates, deadlines, monetary amounts, RUCs, legal
 * references) are extracted regardless of which stage resolves the email.
 *
 * @param email - The email to classify
 * @param context - Optional context: VIP list, known clients, active deadlines,
 *                  sender history
 * @returns Classification result with urgency, score, confidence, contributing
 *          factors, and extracted entities
 */
export function triageEmail(
  email: EmailInput,
  context?: TriageContext,
): TriageResult {
  // Always extract entities first — needed by both stages and returned in result
  const entities = extractEntities(email);

  // --- Stage 1: Fast Filter ---
  const stage1Result = runStage1(email, context);
  if (stage1Result) {
    // Stage 1 already computed entities, but we use our pre-computed ones
    // to ensure consistency
    stage1Result.extractedEntities = entities;

    // If a known client matched, suggestedCaseId is already set.
    // Also try to match via extracted case numbers.
    if (!stage1Result.suggestedCaseId) {
      stage1Result.suggestedCaseId = matchCaseId(entities, context?.activeDeadlines);
    }

    // Attach sentiment data to Stage 1 results too
    const sentiment = analyzeSentiment(email.body);
    stage1Result.sentiment = {
      polarity: sentiment.polarity,
      urgencyModifier: sentiment.urgencyModifier,
      emotions: {
        anger: sentiment.emotions.anger,
        fear: sentiment.emotions.fear,
        joy: sentiment.emotions.joy,
      },
    };

    return stage1Result;
  }

  // --- Stage 2: Heuristic Scoring ---
  return runStage2(email, context, entities);
}
