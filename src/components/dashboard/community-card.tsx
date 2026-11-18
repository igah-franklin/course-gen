import { TelegramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import type { CommunityLinks } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Compact community card for the sidebar. */
export function SidebarCommunityCard({ links }: { links: CommunityLinks }) {
  const item = (href: string | null, label: string, icon: React.ReactNode, color: string) => {
    const cls = cn(
      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition-all",
      href ? "hover:brightness-105" : "cursor-not-allowed opacity-60",
    );
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={{ backgroundColor: color }}>
        {icon} {label}
      </a>
    ) : (
      <span className={cls} style={{ backgroundColor: color }} title="Not configured yet">
        {icon} {label}
      </span>
    );
  };
  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <p className="text-xs font-semibold">Learning community</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Ask questions and share your progress.</p>
      <div className="mt-2.5 grid gap-1.5">
        {item(links.whatsappUrl, "WhatsApp group", <WhatsAppIcon className="size-3.5" />, "#1DA851")}
        {item(links.telegramUrl, "Telegram group", <TelegramIcon className="size-3.5" />, "#229ED9")}
      </div>
    </div>
  );
}
