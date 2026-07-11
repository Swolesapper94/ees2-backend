import type { Rank } from "@prisma/client";
import type { LeadershipDimension } from "./completeness";

// ─────────────────────────────────────────────────────────────────
// Rank-aware goal-setting prompts — DETERMINISTIC, no AI.
//
// Surfaces guiding questions per leadership dimension, scoped to the
// Soldier's grade band (Direct / Organizational / Strategic), drawn from
// the ADP 6-22 Leadership Requirements Model (Attributes/Competencies
// "What a Leader Is/Does" tables + level descriptions).
//
// Grade bands map identically across NCO and Officer ranks — this is the
// one static table that serves both `evalCategory` branches of the
// guided flow (see design doc §2a).
// ─────────────────────────────────────────────────────────────────

export type GradeBand = "DIRECT" | "ORGANIZATIONAL" | "STRATEGIC";

const NCO_DIRECT: Rank[] = ["SGT"];
const NCO_ORGANIZATIONAL: Rank[] = ["SSG", "SFC", "MSG", "FIRST_SERGEANT"];
const NCO_STRATEGIC: Rank[] = ["SGM", "CSM", "SMA"];

const OFFICER_DIRECT: Rank[] = ["SECOND_LT", "FIRST_LT", "WO1", "CW2"];
const OFFICER_ORGANIZATIONAL: Rank[] = ["CPT", "CW3", "CW4", "CW5"];
const OFFICER_STRATEGIC: Rank[] = ["MAJ", "LTC", "COL", "BG", "MG", "LTG", "GEN", "GA"];

export function gradeBandForRank(rank: Rank): GradeBand {
  if (NCO_DIRECT.includes(rank) || OFFICER_DIRECT.includes(rank)) return "DIRECT";
  if (NCO_ORGANIZATIONAL.includes(rank) || OFFICER_ORGANIZATIONAL.includes(rank)) {
    return "ORGANIZATIONAL";
  }
  if (NCO_STRATEGIC.includes(rank) || OFFICER_STRATEGIC.includes(rank)) return "STRATEGIC";
  // Junior enlisted (E1–E4) have no eval/support form in the MVP, but default
  // sensibly rather than throwing if this is ever called for them.
  return "DIRECT";
}

export interface GoalPrompt {
  /** Short guiding question shown above the SmartGoalBuilder for this dimension. */
  question: string;
  /** One doctrinal-flavored example to anchor what "good" looks like. */
  example: string;
}

type PromptTable = Record<GradeBand, Record<LeadershipDimension, GoalPrompt>>;

export const GOAL_PROMPTS: PromptTable = {
  DIRECT: {
    CHARACTER: {
      question: "What's one specific way you'll reinforce Army Values in your day-to-day actions this period?",
      example: "Model integrity in a specific recurring task (e.g., property accountability, PT score reporting).",
    },
    PRESENCE: {
      question: "What measurable fitness or bearing target will you hit this period?",
      example: "Score 270+ on record ACFT by the next test window.",
    },
    INTELLECT: {
      question: "What's one technical or tactical skill you'll sharpen, and how will you prove it?",
      example: "Complete a certification or qualification relevant to your MOS/AOC.",
    },
    LEADS: {
      question: "What's one measurable way you'll improve how you lead your team this period?",
      example: "Consider troop-leading procedures, setting the example, or leading a specific recurring event.",
    },
    DEVELOPS: {
      question: "Who will you help develop this period, and how will you know it worked?",
      example: "Mentor a specific subordinate toward a course, certification, or promotion board.",
    },
    ACHIEVES: {
      question: "What's the single most important result you want to produce this period?",
      example: "Tie it to a concrete mission, task, or metric your team owns.",
    },
  },
  ORGANIZATIONAL: {
    CHARACTER: {
      question: "How will you shape command climate so Army Values are visibly the standard, not the exception?",
      example: "Establish or enforce a specific SHARP/EO practice across the organization.",
    },
    PRESENCE: {
      question: "How will you demonstrate presence and resilience across unexpected, not just routine, situations?",
      example: "Set a fitness/readiness benchmark for the organization, not just yourself.",
    },
    INTELLECT: {
      question: "What organizational-level problem will you apply sound judgment and innovation to this period?",
      example: "Improve a process, SOP, or system used at company/battalion level.",
    },
    LEADS: {
      question: "How will you extend influence beyond your direct chain of command this period?",
      example: "Coordinate across sections/units to unblock a shared problem.",
    },
    DEVELOPS: {
      question: "What will you do to identify and develop future leaders in your formation?",
      example: "Build a coaching/mentoring program or identify NCOs/officers for advanced schools.",
    },
    ACHIEVES: {
      question: "What complex, resource-constrained outcome will you own and deliver this period?",
      example: "Prioritize limited resources against a demanding training or operational goal.",
    },
  },
  STRATEGIC: {
    CHARACTER: {
      question: "How will you demonstrate stewardship of the Army profession this period?",
      example: "Set policy or precedent that reinforces Army Values at scale.",
    },
    PRESENCE: {
      question: "How will you manage complexity and represent the organization at the strategic level?",
      example: "Serve as a champion/ambassador for a strategic-level initiative or relationship.",
    },
    INTELLECT: {
      question: "What broad, multi-perspective problem will you apply strategic thinking to this period?",
      example: "Use Army design methodology on a problem spanning multiple organizations.",
    },
    LEADS: {
      question: "What vision will you set for operational/strategic-level operations this period?",
      example: "Define and communicate a multi-organization vision or framework.",
    },
    DEVELOPS: {
      question: "What system or policy will you create to grow leaders across the organization?",
      example: "Institutionalize a professional-development pipeline or resourcing policy.",
    },
    ACHIEVES: {
      question: "What large-scale outcome will you align multiple organizations to achieve this period?",
      example: "Organize, resource, and integrate efforts across organizations toward one mission goal.",
    },
  },
};

export function promptFor(rank: Rank, dimension: LeadershipDimension): GoalPrompt {
  return GOAL_PROMPTS[gradeBandForRank(rank)][dimension];
}
