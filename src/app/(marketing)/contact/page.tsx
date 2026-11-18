import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/info-page";

export const metadata: Metadata = { title: "Contact" };

const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function ContactPage() {
  return (
    <InfoPage title="Contact us" intro="Questions, feedback, partnership or support requests — we'd love to hear from you.">
      {email ? (
        <p>
          Email us at <a href={`mailto:${email}`}>{email}</a>. We usually reply within two business days.
        </p>
      ) : (
        <p>
          A contact address has not been configured yet. Administrators can set <code>NEXT_PUBLIC_CONTACT_EMAIL</code>.
          In the meantime, the community channels on the home page are the fastest way to reach us.
        </p>
      )}
    </InfoPage>
  );
}
