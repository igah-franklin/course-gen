import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getCommunityLinks, getSetting } from "@/lib/settings";

/** Cached reads for public pages. Invalidated with updateTag("settings") on admin save. */
export async function getCachedCommunityLinks() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");
  return getCommunityLinks();
}

export async function getCachedCertificateSettings() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");
  return getSetting("certificates");
}
