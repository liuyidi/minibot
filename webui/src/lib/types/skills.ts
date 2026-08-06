/** Skills catalog API payloads. */

export interface SkillSummary {
  name: string;
  description: string;
  source: "workspace" | "builtin" | string;
  available: boolean;
  unavailable_reason?: string;
}

export interface SkillRequirements {
  bins: string[];
  env: string[];
  missing_bins: string[];
  missing_env: string[];
}

export interface SkillDetail extends SkillSummary {
  requirements: SkillRequirements;
  raw_markdown: string;
}

export interface SkillsPayload { skills: SkillSummary[]; }
