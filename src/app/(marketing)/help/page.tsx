import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/info-page";

export const metadata: Metadata = { title: "Help Center" };

const faqs = [
  {
    q: "Which YouTube links are supported?",
    a: "Standard watch URLs (youtube.com/watch?v=…), short links (youtu.be/…), Shorts (youtube.com/shorts/…), embed and live links.",
  },
  {
    q: "How is the video analysed?",
    a: "We retrieve the video's captions (or, if you choose, an AI transcription), split the full transcript into chunks, and extract every teaching point with timestamps. Those points are organised into modules and lessons, and a coverage check confirms each one is taught.",
  },
  {
    q: "What if the video has no captions?",
    a: "You can enable AI transcription of the audio, upload your own transcript/caption file (VTT, SRT or timestamped text), or upload a media file you own for transcription.",
  },
  {
    q: "Does the AI see what's on screen?",
    a: "Not by default — analysis is based on what is said. You can upload screenshots of key moments so lessons include accurate descriptions of on-screen content. Lessons flag places where the video relies on visuals and link you to the exact timestamp.",
  },
  {
    q: "Do I need to keep the browser open while a course generates?",
    a: "No. Generation runs in the background. You can close the tab and come back later — the course will be waiting in My Courses.",
  },
  {
    q: "How do I earn a certificate?",
    a: "Complete all required lessons and pass the final assessment (when enabled). You'll then be able to download a PDF certificate with a verification link and QR code.",
  },
];

export default function HelpPage() {
  return (
    <InfoPage title="Help Center" intro="Answers to the most common questions.">
      <div className="not-prose space-y-4">
        {faqs.map((f) => (
          <details key={f.q} className="group rounded-xl border bg-card p-5 shadow-xs open:shadow-sm">
            <summary className="cursor-pointer list-none text-[15px] font-medium marker:hidden">{f.q}</summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
