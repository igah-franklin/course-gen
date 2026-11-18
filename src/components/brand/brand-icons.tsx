import { siClaude, siTelegram, siWhatsapp, siYoutube } from "simple-icons";
import { cn } from "@/lib/utils";

type IconProps = { className?: string; title?: string };

function BrandIcon({ path, className, title }: IconProps & { path: string }) {
  return (
    <svg
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}

/** Official WhatsApp glyph (simple-icons). */
export const WhatsAppIcon = (p: IconProps) => <BrandIcon path={siWhatsapp.path} {...p} />;
/** Official Telegram glyph (simple-icons). */
export const TelegramIcon = (p: IconProps) => <BrandIcon path={siTelegram.path} {...p} />;
export const ClaudeIcon = (p: IconProps) => <BrandIcon path={siClaude.path} {...p} />;
export const YouTubeIcon = (p: IconProps) => <BrandIcon path={siYoutube.path} {...p} />;

export const BRAND_COLORS = {
  whatsapp: `#${siWhatsapp.hex}`,
  telegram: `#${siTelegram.hex}`,
  youtube: `#${siYoutube.hex}`,
};
