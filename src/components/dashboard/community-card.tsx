import { TelegramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import type { CommunityLinks } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Compact community card for the sidebar. */
export function SidebarCommunityCard({ links }: { links: CommunityLinks }) {
  const item = (href: string | null, label: string, icon: React.ReactNode, color: string) => {
    const cls = cn(
      "flex size-11 items-center justify-center rounded-2xl text-white shadow-sm transition-all [&_svg]:size-5",
      href ? "hover:-translate-y-0.5 hover:shadow-md hover:brightness-105" : "cursor-not-allowed opacity-60",
    );
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={{ backgroundColor: color }} aria-label={label} title={label}>
        {icon}
      </a>
    ) : (
      <span className={cls} style={{ backgroundColor: color }} title={`${label} — not configured yet`} aria-label={label}>
        {icon}
      </span>
    );
  };
  return (
    <div className="relative overflow-hidden rounded-3xl bg-sidebar-accent px-4 pt-5 pb-4 text-center">
      {/* decorative rings */}
      <span aria-hidden className="pointer-events-none absolute -top-10 -left-10 size-28 rounded-full border border-foreground/[0.06]" />
      <span aria-hidden className="pointer-events-none absolute -right-8 -bottom-12 size-32 rounded-full border border-foreground/[0.06]" />
      <p className="relative text-base leading-snug font-medium">
        Learn better,
        <br />
        together
      </p>
      <p className="relative mt-1 text-xs text-muted-foreground">Ask questions & share progress</p>
      <div className="relative mt-4 flex justify-center gap-2.5">
        {item(links.whatsappUrl, "WhatsApp group", <WhatsAppIcon />, "#1DA851")}
        {item(links.telegramUrl, "Telegram group", <TelegramIcon />, "#229ED9")}
      </div>
    </div>
  );
}
