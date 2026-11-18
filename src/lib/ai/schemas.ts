import { z } from "zod";

/* Schemas for every structured AI output. They are sent to the model as JSON
 * schemas (structured outputs) AND used to validate responses before saving. */

// ---------- 1. Chunk analysis: every teaching point in a transcript window ----------
export const PointKind = z.enum([
  "topic",
  "subtopic",
  "concept",
  "definition",
  "demonstration",
  "instruction",
  "example",
  "tip",
  "warning",
  "important_detail",
]);

export const ChunkAnalysis = z.object({
  chunk_summary: z.string().describe("Faithful 2-4 sentence summary of this window of the video"),
  points: z.array(
    z.object({
      local_id: z.string().describe("Short id unique within this chunk, e.g. p1, p2"),
      kind: PointKind,
      title: z.string(),
      detail: z
        .string()
        .describe("Thorough, faithful description of what the video teaches here, including specifics, numbers, names"),
      start_seconds: z.number().nullable(),
      end_seconds: z.number().nullable(),
      steps: z.array(z.string()).describe("Ordered actions when this is a demonstration/instruction; otherwise empty"),
      code_or_commands: z.array(z.string()).describe("Code, commands, settings or values stated in the transcript, verbatim"),
      visual_dependency: z.enum(["none", "partial", "essential"]),
      visual_note: z
        .string()
        .describe("What the learner would need to SEE that the transcript does not capture; empty if none"),
      parent_local_id: z.string().nullable(),
    }),
  ),
  unresolved_references: z
    .array(z.string())
    .describe("Things the speaker refers to that are not explained in this window (e.g. 'as you can see here')"),
});
export type ChunkAnalysis = z.infer<typeof ChunkAnalysis>;

// ---------- 1b. User-provided frame analysis ----------
export const FrameAnalysis = z.object({
  title: z.string(),
  description: z.string().describe("What the frame shows, objectively"),
  visible_text: z.array(z.string()),
  ui_elements: z.array(z.object({ label: z.string(), purpose: z.string() })),
  teaching_relevance: z.string(),
});
export type FrameAnalysis = z.infer<typeof FrameAnalysis>;

// ---------- 2. Course overview + learning objectives ----------
export const CourseOverview = z.object({
  title: z.string(),
  subtitle: z.string(),
  description: z.string().describe("Detailed 2-4 paragraph course description (markdown allowed)"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  target_audience: z.string(),
  prerequisites: z.array(z.string()),
  learning_objectives: z.array(z.string()),
  duplicate_groups: z
    .array(z.object({ keep_id: z.string(), duplicate_ids: z.array(z.string()), reason: z.string() }))
    .describe("Only points that are literally the same teaching point repeated (e.g. recap). Be conservative."),
});
export type CourseOverview = z.infer<typeof CourseOverview>;

// ---------- 3. Curriculum ----------
export const Curriculum = z.object({
  modules: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      lessons: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          learning_objectives: z.array(z.string()),
          point_ids: z.array(z.string()).describe("Teaching point ids this lesson must fully teach"),
          start_seconds: z.number().nullable(),
          end_seconds: z.number().nullable(),
        }),
      ),
    }),
  ),
});
export type Curriculum = z.infer<typeof Curriculum>;

// ---------- 4. Lesson ----------
export const SourceTag = z.enum(["original", "supplementary"]);

export const LessonContent = z.object({
  introduction: z.string().describe("What the learner will understand/be able to do by the end (markdown)"),
  learning_objectives: z.array(z.string()),
  explanation_sections: z.array(
    z.object({
      heading: z.string(),
      body: z
        .string()
        .describe("Markdown. Explain what it is, why it matters, how it works, when to use it, how it connects"),
    }),
  ),
  steps: z.array(
    z.object({
      title: z.string(),
      instruction: z.string().describe("Markdown — exactly what to do, including intermediate actions"),
      command: z.string().nullable().describe("Command/code to type for this step, verbatim from the video if given"),
      expected_result: z.string().nullable(),
      timestamp_seconds: z.number().nullable(),
    }),
  ),
  code_examples: z.array(
    z.object({
      title: z.string(),
      language: z.string(),
      code: z.string(),
      explanation: z.string(),
      source: SourceTag,
    }),
  ),
  examples: z.array(
    z.object({
      title: z.string(),
      body: z.string().describe("Markdown"),
      source: SourceTag,
      timestamp_seconds: z.number().nullable(),
    }),
  ),
  common_mistakes: z.array(z.object({ mistake: z.string(), how_to_avoid: z.string() })),
  key_takeaways: z.array(z.string()),
  knowledge_check: z.array(z.object({ question: z.string(), answer: z.string() })),
  visual_gaps: z
    .array(z.string())
    .describe("On-screen information the transcript implies but does not describe; empty if none"),
  covered_point_ids: z.array(z.string()),
  estimated_reading_minutes: z.number(),
});
export type LessonContent = z.infer<typeof LessonContent>;

// ---------- 5. Illustrations ----------
export const IllustrationType = z.enum([
  "flowchart",
  "sequence",
  "architecture",
  "concept_map",
  "timeline",
  "numbered_steps",
  "comparison",
  "annotated_code",
]);

export const IllustrationSet = z.object({
  illustrations: z.array(
    z.object({
      type: IllustrationType,
      title: z.string(),
      description: z.string().describe("What the illustration represents and how to read it"),
      explanation: z.string().describe("Detailed explanation of the illustration (markdown)"),
      labels: z.array(z.string()),
      mermaid: z
        .string()
        .nullable()
        .describe("Valid Mermaid source for flowchart/sequence/architecture/concept_map/timeline; null otherwise"),
      steps: z.array(z.object({ number: z.number(), label: z.string(), detail: z.string() })),
      comparison: z
        .object({
          left_title: z.string(),
          right_title: z.string(),
          rows: z.array(z.object({ aspect: z.string(), left: z.string(), right: z.string() })),
        })
        .nullable(),
      code: z
        .object({
          language: z.string(),
          code: z.string(),
          annotations: z.array(z.object({ line: z.number(), note: z.string() })),
        })
        .nullable(),
      timestamp_seconds: z.number().nullable(),
      image_prompt: z
        .string()
        .nullable()
        .describe("Optional prompt for a raster concept image; null unless a picture genuinely helps"),
    }),
  ),
});
export type IllustrationSet = z.infer<typeof IllustrationSet>;

// ---------- 6. Assessments ----------
export const QuizSpec = z.object({
  title: z.string(),
  description: z.string(),
  questions: z.array(
    z.object({
      type: z.enum(["multiple_choice", "true_false", "short_answer", "practical"]),
      question: z.string(),
      options: z.array(z.string()).describe("4 options for multiple_choice, ['True','False'] for true_false, else []"),
      correct_answer: z
        .string()
        .describe("Exact option text for choice questions; model answer / rubric for short_answer and practical"),
      explanation: z.string().describe("Why the answer is correct, referencing the lesson"),
      lesson_id: z.string().describe("Id of the lesson this question tests"),
    }),
  ),
});
export type QuizSpec = z.infer<typeof QuizSpec>;

// ---------- 7. Quality review ----------
export const QualityReview = z.object({
  overall_score: z.number().describe("0-100"),
  checks: z.array(
    z.object({
      check: z.enum([
        "topic_coverage",
        "teaching_points",
        "logical_sequence",
        "reproducible_demonstrations",
        "examples_preserved",
        "timestamps",
        "illustration_relevance",
        "no_fabrication",
        "quiz_consistency",
        "readability",
      ]),
      passed: z.boolean(),
      notes: z.string(),
    }),
  ),
  lesson_issues: z.array(
    z.object({ lesson_id: z.string(), severity: z.enum(["info", "warning", "critical"]), issue: z.string() }),
  ),
});
export type QualityReview = z.infer<typeof QualityReview>;

// ---------- 8. Short-answer grading ----------
export const GradeResult = z.object({
  results: z.array(
    z.object({
      question_id: z.string(),
      correct: z.boolean(),
      score: z.number().describe("0 to 1"),
      feedback: z.string(),
    }),
  ),
});
export type GradeResult = z.infer<typeof GradeResult>;
