import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/info-page";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <InfoPage
      title={`About ${publicEnv.appName}`}
      intro="We make learning from YouTube as structured and effective as taking a well-designed course."
    >
      <p>
        YouTube is one of the largest libraries of free education in the world, but videos are hard to study from: you
        scrub back and forth, lose your place, and forget the details. {publicEnv.appName} analyses the full content of an
        educational video and turns it into a complete course — modules, detailed lessons, step-by-step instructions,
        illustrations, quizzes and a certificate.
      </p>
      <h2>Our principles</h2>
      <ul>
        <li><strong>Completeness.</strong> Every meaningful teaching point in the video should appear in the course.</li>
        <li><strong>Honesty.</strong> We tell you exactly what was analysed and label anything that is supplementary.</li>
        <li><strong>Respect for creators.</strong> Every lesson links back to the original video at the relevant moment.</li>
      </ul>
    </InfoPage>
  );
}
