/** Display labels for course sources — pure, safe on client and server. */

export type CourseSourceType = "youtube" | "video_upload" | "document" | "article" | "prompt";

export const SOURCE_TYPE_LABEL: Record<CourseSourceType, string> = {
  youtube: "YouTube video",
  video_upload: "Uploaded recording",
  document: "Document",
  article: "Article",
  prompt: "AI-written brief",
};

export function sourceTypeOf(v: unknown): CourseSourceType {
  return v === "video_upload" || v === "document" || v === "article" || v === "prompt" ? v : "youtube";
}
