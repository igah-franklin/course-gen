import { publicEnv } from "@/lib/env";

export function verificationUrl(token: string) {
  return `${publicEnv.siteUrl}/certificate/verify/${token}`;
}

/** LinkedIn "Add to profile" (certification) deep link. */
export function linkedInAddUrl(opts: { name: string; organization: string; issuedAt: string; certId: string; certUrl: string }) {
  const d = new Date(opts.issuedAt);
  const p = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: opts.name,
    organizationName: opts.organization,
    issueYear: String(d.getFullYear()),
    issueMonth: String(d.getMonth() + 1),
    certUrl: opts.certUrl,
    certId: opts.certId,
  });
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}
