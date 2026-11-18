import { TelegramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import type { CommunityLinks } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 [&_svg]:size-3.5",
  md: "h-10 px-4 text-sm gap-2 [&_svg]:size-4",
  lg: "h-12 px-6 text-[15px] gap-2.5 [&_svg]:size-5",
};

function CommunityLink({
  href,
  label,
  icon,
  color,
  size,
  className,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
  color: string;
  size: Size;
  className?: string;
}) {
  const base = cn(
    "inline-flex items-center justify-center rounded-xl font-medium text-white shadow-sm transition-all",
    sizes[size],
    className,
  );
  if (!href) {
    return (
      <span
        className={cn(base, "cursor-not-allowed opacity-60")}
        style={{ backgroundColor: color }}
        title="Community link not configured yet"
        aria-disabled
      >
        {icon}
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, "hover:-translate-y-0.5 hover:shadow-md hover:brightness-105")}
      style={{ backgroundColor: color }}
    >
      {icon}
      {label}
    </a>
  );
}

export function WhatsAppButton({
  href,
  size = "md",
  label = "Join WhatsApp Community",
  className,
}: {
  href: string | null;
  size?: Size;
  label?: string;
  className?: string;
}) {
  return (
    <CommunityLink href={href} label={label} icon={<WhatsAppIcon />} color="#1DA851" size={size} className={className} />
  );
}

export function TelegramButton({
  href,
  size = "md",
  label = "Join Telegram Community",
  className,
}: {
  href: string | null;
  size?: Size;
  label?: string;
  className?: string;
}) {
  return (
    <CommunityLink href={href} label={label} icon={<TelegramIcon />} color="#229ED9" size={size} className={className} />
  );
}

export function CommunityButtons({
  links,
  size = "md",
  className,
  compactLabels = false,
}: {
  links: CommunityLinks;
  size?: Size;
  className?: string;
  compactLabels?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <WhatsAppButton href={links.whatsappUrl} size={size} label={compactLabels ? "WhatsApp" : undefined} />
      <TelegramButton href={links.telegramUrl} size={size} label={compactLabels ? "Telegram" : undefined} />
    </div>
  );
}
