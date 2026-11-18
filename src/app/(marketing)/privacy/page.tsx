import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/info-page";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy Policy" intro={`How ${publicEnv.appName} collects, uses and protects your information.`}>
      <h2>Information we collect</h2>
      <ul>
        <li>Account details: your name, email address and (if you use Google sign-in) your profile picture.</li>
        <li>Learning data: courses you create, lesson progress, bookmarks, notes, quiz attempts and certificates.</li>
        <li>Content you submit: YouTube URLs and any transcripts, screenshots or media files you upload.</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To generate and deliver your courses, track your progress, issue certificates and operate the service. Video
        transcripts and uploaded media are sent to our AI and transcription providers solely to produce your course.
      </p>
      <h2>Certificates</h2>
      <p>
        The public verification page for a certificate shows the certificate number, recipient name as printed on the
        certificate, course title and issue date — never your email address or account details.
      </p>
      <h2>Your choices</h2>
      <p>
        You can edit your profile, delete courses, and request account deletion at any time from Settings or by
        contacting us.
      </p>
      <p className="text-sm text-muted-foreground">
        This policy is a starting template; operators should review it with legal counsel before launch.
      </p>
    </InfoPage>
  );
}
