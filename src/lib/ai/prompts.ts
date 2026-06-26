export const PROMPT_VERSION = "2025-06-v1";

export const SYSTEM_PROMPT = `
You are an expert Army evaluation writer with deep knowledge of AR 623-3,
DA PAM 623-3, and Army leadership doctrine (ADP 6-22).

You help raters write NCOER bullets for DA Form 2166-9 series evaluations.
Your role is to assist and suggest — the rater owns the final assessment.

BULLET WRITING RULES (from DA PAM 623-3):
- Begin every bullet with a strong action verb
- Include quantifiable impact wherever the input supports it
  (X of Y Soldiers, $X equipment value, X% improvement, X/X possible score)
- Tie performance to mission impact or Army Values
- Do NOT use first person (no "I", "my", "we")
- Use active voice
- Maximum 200 characters per bullet
- Each bullet must stand alone — no bullet requires reading another
- Avoid vague language ("assisted with", "helped to", "participated in")
- Prohibited: personal opinions, reference to race, gender, religion, SSN

IMPORTANT: You generate candidates. The rater decides what goes on the form.
Return ONLY a valid JSON array of strings. No preamble, no explanation,
no markdown code fences.
Example: ["Bullet one", "Bullet two", "Bullet three"]
`.trim();

export interface SectionPromptInput {
  soldierRank: string;
  soldierMos: string;
  dutyTitle: string;
  section: string;
  sectionDefinition: string;
  raterResponses: Record<string, string>;
  supportEntries: string[];
}

export function buildSectionPrompt(input: SectionPromptInput): string {
  return `
SOLDIER: ${input.soldierRank}, MOS ${input.soldierMos}
DUTY TITLE: ${input.dutyTitle}
SECTION: ${input.section}

SECTION DEFINITION:
${input.sectionDefinition}

RATER'S ASSESSMENT (use this to shape the bullets — this is their judgment):
${Object.entries(input.raterResponses)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

SUPPORT FORM ENTRIES (raw accomplishments and objectives to draw from):
${input.supportEntries.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Generate 4 NCOER bullet candidates for the ${input.section} section.
Prioritize the rater's assessment. Use support form entries as evidence.
Return JSON array only.
`.trim();
}

export interface RefineBulletInput {
  section: string;
  originalBullet: string;
  instruction: string;
}

export function buildRefinePrompt(input: RefineBulletInput): string {
  return `
SECTION: ${input.section}

ORIGINAL BULLET:
${input.originalBullet}

RATER'S REFINEMENT INSTRUCTION:
${input.instruction}

Rewrite the bullet according to the instruction while keeping all bullet
writing rules. Return a JSON array with a single refined bullet string.
`.trim();
}

// Section definitions drawn from DA 2166-9-1A doctrinal text
export const SECTION_DEFINITIONS: Record<string, string> = {
  CHARACTER: `Army Values (Loyalty, Duty, Respect, Selfless Service, Honor, Integrity,
Personal Courage), Empathy, Warrior Ethos/Service Ethos, Discipline.
Must address SHARP, EO, and EEO adherence.`,

  PRESENCE: `Military and professional bearing, Fitness, Confidence, Resilience.
The impression the NCO makes — outward appearance, demeanor, actions, words.`,

  INTELLECT: `Mental agility, Sound judgment, Innovation, Interpersonal tact, Expertise.
Conceptual abilities applied to duties: problem solving, analytical thinking,
anticipating second and third order effects.`,

  LEADS: `Leads others, Builds trust, Extends influence beyond the chain of command,
Leads by example, Communicates. Motivates, inspires, and influences others
toward mission accomplishment.`,

  DEVELOPS: `Creates a positive environment/Fosters esprit de corps, Prepares self,
Develops others, Stewards the profession. Long-term focus on people and organization.`,

  ACHIEVES: `Gets Results. A leader's ultimate purpose is to accomplish tasks and achieve
results. Focus on consistent, ethical task accomplishment through supervising,
managing, monitoring, and controlling work.`,
};
