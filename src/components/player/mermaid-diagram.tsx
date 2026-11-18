"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";

let initialized = false;

/** Renders Mermaid source client-side; falls back to showing the source if it fails to parse. */
export function MermaidDiagram({ code, title }: { code: string; title: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: {
              primaryColor: "#eef2ff",
              primaryBorderColor: "#6366f1",
              primaryTextColor: "#1e1b4b",
              lineColor: "#94a3b8",
              secondaryColor: "#f8fafc",
              tertiaryColor: "#ffffff",
              fontSize: "14px",
            },
          });
          initialized = true;
        }
        const { svg } = await mermaid.render(`m${id}`, code);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs" aria-label={`${title} (diagram source)`}>
        {code}
      </pre>
    );
  }
  if (!svg) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={title}
      className="flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // Mermaid output is generated with securityLevel "strict" (sanitised).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
