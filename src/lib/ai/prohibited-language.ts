// ─────────────────────────────────────────────────────────────────
// Prohibited Language + Quality Module (Delta Section 5)
//
// Backend copy of ees2-frontend/src/lib/ai/prohibited-language.ts —
// that module's own header comment claims it "runs in three places:
// real-time in the editor, before the staging → form move, and in the
// pre-submission consistency check", but until now it was frontend-only
// and imported nowhere (MVP audit 5.14: fully dead code, and even if
// wired up client-side, a direct API call could bypass it entirely
// since "backend owns the rules"). This is the server-side enforcement
// point — pure logic, no dependencies, deliberately identical to the
// frontend copy so both surfaces agree on what's prohibited.
// ─────────────────────────────────────────────────────────────────

export type BulletIssueType =
  | "PROHIBITED"
  | "VAGUE"
  | "FIRST_PERSON"
  | "SUPERLATIVE"
  | "FUTURE_PROMISE"
  | "LENGTH";

export interface BulletIssue {
  type: BulletIssueType;
  severity: "ERROR" | "WARNING";
  match: string;
  suggestion: string;
}

export interface BulletQualityResult {
  passed: boolean;
  issues: BulletIssue[];
}

const PROHIBITED_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\b(I|my|me|we|our|us)\b/gi,
    message: "First person is prohibited on NCOERs",
  },
  {
    pattern:
      /\b(race|racial|ethnic|ethnicity|religion|religious|gender|sex|sexual|disability|national origin)\b/gi,
    message: "References to protected class characteristics are prohibited",
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    message: "Do not include SSN on evaluation reports",
  },
  {
    pattern:
      /\b(married|single|divorced|spouse|husband|wife|children|pregnant)\b/gi,
    message: "References to marital or family status are prohibited",
  },
  {
    pattern: /\b(democrat|republican|political party)\b/gi,
    message: "Political references are prohibited",
  },
];

const VAGUE_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\b(assisted with|helped to|participated in|was involved in)\b/gi,
    message: "Vague — specify what this NCO did directly",
  },
  {
    pattern: /\b(various|numerous|many|several|some)\b/gi,
    message: "Quantify where possible",
  },
  {
    pattern: /\b(very|extremely|highly|incredibly)\b/gi,
    message: "Avoid adverb intensifiers — let the action speak",
  },
];

const SUPERLATIVE_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\b(best|greatest|most talented|number one|#1|top performer)\b/gi,
    message: "Superlatives require comparative evidence",
  },
];

const FUTURE_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\b(will|should be promoted|promote immediately|potential to)\b/gi,
    message: "Evals assess past performance — remove future-tense language",
  },
];

/**
 * Inspects a single bullet for prohibited language, vagueness, superlatives,
 * future-tense promises, and length. ERROR-severity issues block the bullet
 * from moving to the form; WARNINGs are surfaced but non-blocking.
 */
export function checkBulletQuality(text: string): BulletQualityResult {
  const issues: BulletIssue[] = [];

  if (text.length > 200) {
    issues.push({
      type: "LENGTH",
      severity: "ERROR",
      match: `${text.length} chars`,
      suggestion: `Reduce by ${text.length - 200} characters`,
    });
  }

  for (const { pattern, message } of PROHIBITED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        type: "PROHIBITED",
        severity: "ERROR",
        match: match[0],
        suggestion: message,
      });
    }
  }
  for (const { pattern, message } of VAGUE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        type: "VAGUE",
        severity: "WARNING",
        match: match[0],
        suggestion: message,
      });
    }
  }
  for (const { pattern, message } of SUPERLATIVE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        type: "SUPERLATIVE",
        severity: "WARNING",
        match: match[0],
        suggestion: message,
      });
    }
  }
  for (const { pattern, message } of FUTURE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        type: "FUTURE_PROMISE",
        severity: "ERROR",
        match: match[0],
        suggestion: message,
      });
    }
  }

  return { passed: !issues.some((i) => i.severity === "ERROR"), issues };
}
