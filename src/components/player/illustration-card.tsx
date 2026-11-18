import { Clock, Image as ImageIcon, Workflow } from "lucide-react";
import { MermaidDiagram } from "./mermaid-diagram";
import { Markdown } from "@/components/shared/markdown";
import { formatTimestamp, timestampUrl } from "@/lib/youtube/url";

export type IllustrationRow = {
  id: string;
  image_type: string;
  source: string;
  title: string;
  description: string | null;
  image_url: string | null;
  signed_url?: string | null;
  timestamp_seconds: number | null;
  metadata: {
    explanation?: string;
    labels?: string[];
    mermaid?: string | null;
    steps?: { number: number; label: string; detail: string }[];
    comparison?: { left_title: string; right_title: string; rows: { aspect: string; left: string; right: string }[] } | null;
    code?: { language: string; code: string; annotations: { line: number; note: string }[] } | null;
    visible_text?: string[];
  };
};

const TYPE_LABEL: Record<string, string> = {
  flowchart: "Flowchart",
  sequence: "Sequence diagram",
  architecture: "Architecture diagram",
  concept_map: "Concept map",
  timeline: "Timeline",
  numbered_steps: "Visual walkthrough",
  comparison: "Comparison",
  annotated_code: "Annotated code",
  video_frame: "Frame from the video",
  image: "Screenshot",
};

export function IllustrationCard({ ill, videoId, index }: { ill: IllustrationRow; videoId: string; index: number }) {
  const m = ill.metadata ?? {};
  const imgSrc = ill.signed_url ?? ill.image_url;
  return (
    <figure className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {imgSrc ? <ImageIcon className="size-4 shrink-0 text-primary" /> : <Workflow className="size-4 shrink-0 text-primary" />}
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Figure {index + 1} · {TYPE_LABEL[ill.image_type] ?? "Illustration"}
          </span>
        </div>
        {ill.timestamp_seconds != null && (
          <a
            href={timestampUrl(videoId, ill.timestamp_seconds)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Clock className="size-3" /> {formatTimestamp(ill.timestamp_seconds)}
          </a>
        )}
      </div>

      <div className="p-5">
        <h4 className="font-semibold">{ill.title}</h4>
        {ill.description && <p className="mt-1 text-sm text-muted-foreground">{ill.description}</p>}

        <div className="mt-4">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgSrc} alt={ill.title} loading="lazy" className="w-full rounded-xl border bg-muted object-contain" />
          ) : m.mermaid ? (
            <div className="rounded-xl border bg-background p-4">
              <MermaidDiagram code={m.mermaid} title={ill.title} />
            </div>
          ) : null}

          {m.steps && m.steps.length > 0 && (
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {m.steps.map((s) => (
                <li key={s.number} className="flex gap-3 rounded-xl border bg-background p-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {s.number}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {m.comparison && (
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium" />
                    <th className="px-3 py-2 font-medium">{m.comparison.left_title}</th>
                    <th className="px-3 py-2 font-medium">{m.comparison.right_title}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.comparison.rows.map((r) => (
                    <tr key={r.aspect} className="border-t align-top">
                      <td className="px-3 py-2 font-medium">{r.aspect}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.left}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.right}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {m.code && (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <pre className="overflow-x-auto bg-[oklch(0.2_0.02_265)] p-4 text-[13px] leading-6 text-[oklch(0.93_0.01_265)]">
                {m.code.code.split("\n").map((line, i) => {
                  const note = m.code!.annotations.find((a) => a.line === i + 1);
                  return (
                    <div key={i} className={note ? "-mx-4 bg-white/5 px-4" : undefined}>
                      <span className="mr-4 inline-block w-6 text-right text-white/30 select-none">{i + 1}</span>
                      {line || " "}
                      {note && (
                        <span className="ml-3 rounded bg-primary/80 px-1.5 text-[11px] text-white select-none">
                          {m.code!.annotations.indexOf(note) + 1}
                        </span>
                      )}
                    </div>
                  );
                })}
              </pre>
              {m.code.annotations.length > 0 && (
                <ol className="space-y-1.5 border-t bg-muted/30 p-4 text-sm">
                  {m.code.annotations.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
                        {i + 1}
                      </span>
                      <span>
                        <span className="text-muted-foreground">Line {a.line}:</span> {a.note}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {m.labels && m.labels.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {m.labels.map((l) => (
              <span key={l} className="rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {l}
              </span>
            ))}
          </div>
        )}
        {m.explanation && (
          <figcaption className="mt-4 border-t pt-4">
            <Markdown className="text-sm leading-6">{m.explanation}</Markdown>
          </figcaption>
        )}
        {(ill.source === "video_frame" || ill.source === "user_upload") && (
          <p className="mt-3 text-[11px] text-muted-foreground">Screenshot provided by the course creator.</p>
        )}
      </div>
    </figure>
  );
}
