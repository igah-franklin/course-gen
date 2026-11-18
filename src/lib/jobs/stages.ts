/** Stage metadata shared by the server pipeline and the progress UI. */

export const STAGE_LABELS = {
  metadata: "Retrieving video information",
  transcript: "Extracting transcript",
  analyze: "Analyzing video content",
  objectives: "Identifying learning objectives",
  structure: "Organizing course modules",
  lessons: "Generating detailed lessons",
  illustrations: "Creating educational illustrations",
  assessments: "Generating assessments",
  quality: "Verifying course quality",
  save: "Saving course",
} as const;

export type StageKey = keyof typeof STAGE_LABELS;
export type JobType = "generate_course" | "assistant_generate" | "regenerate_lesson" | "regenerate_illustrations";

/** Jobs driven by the user's own AI assistant over MCP — never run by the background runner. */
export const ASSISTANT_JOB: JobType = "assistant_generate";

export const JOB_STAGES: Record<JobType, StageKey[]> = {
  generate_course: [
    "metadata",
    "transcript",
    "analyze",
    "objectives",
    "structure",
    "lessons",
    "illustrations",
    "assessments",
    "quality",
    "save",
  ],
  assistant_generate: [
    "metadata",
    "transcript",
    "analyze",
    "objectives",
    "structure",
    "lessons",
    "illustrations",
    "assessments",
    "quality",
    "save",
  ],
  regenerate_lesson: ["lessons", "illustrations", "save"],
  regenerate_illustrations: ["illustrations", "save"],
};

/** Stages whose task failures abort the job (the course can't be honest without them). */
export const CRITICAL_STAGES: StageKey[] = ["metadata", "transcript", "analyze", "objectives", "structure", "save"];

/** Max tasks of a stage processed in parallel within one slice. */
export const STAGE_CONCURRENCY: Record<StageKey, number> = {
  metadata: 1,
  transcript: 1,
  analyze: 4,
  objectives: 1,
  structure: 1,
  lessons: 3,
  illustrations: 4,
  assessments: 3,
  quality: 1,
  save: 1,
};

export const MAX_TASK_ATTEMPTS = 3;

export type JobStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";

export type JobState = {
  stagesDone?: StageKey[];
  planned?: StageKey[];
  hasTimestamps?: boolean;
  warnings?: string[];
};
