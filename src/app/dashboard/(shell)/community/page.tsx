import type { Metadata } from "next";
import { HeartHandshake, Megaphone, MessageCircleQuestion, Share2 } from "lucide-react";
import { TelegramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import { TelegramButton, WhatsAppButton } from "@/components/shared/community-buttons";
import { getCachedCommunityLinks } from "@/lib/settings-cached";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage() {
  const links = await getCachedCommunityLinks();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mx-auto max-w-2xl py-6 text-center">
        <p className="text-sm font-medium text-primary">Community</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Your Learning Journey Doesn&apos;t Have to Be Alone.
        </h1>
        <p className="mt-4 text-muted-foreground">Connect with other learners turning videos into real skills.</p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border bg-card p-7 shadow-xs">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#1DA851]" />
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#1DA851]/10 text-[#1DA851]">
            <WhatsAppIcon className="size-6" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">WhatsApp Community</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Join our WhatsApp learning community to connect with other students, ask questions, share your progress, and
            receive important updates.
          </p>
          <WhatsAppButton href={links.whatsappUrl} size="lg" label="Join WhatsApp Group" className="mt-6 w-full" />
        </div>
        <div className="relative overflow-hidden rounded-2xl border bg-card p-7 shadow-xs">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#229ED9]" />
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#229ED9]/10 text-[#229ED9]">
            <TelegramIcon className="size-6" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">Telegram Community</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Join our Telegram community for discussions, learning resources, announcements, and additional support.
          </p>
          <TelegramButton href={links.telegramUrl} size="lg" label="Join Telegram Group" className="mt-6 w-full" />
        </div>
      </div>

      {(!links.whatsappUrl || !links.telegramUrl) && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Some community links haven&apos;t been configured yet. Administrators can set them in Admin → Settings.
        </p>
      )}

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: MessageCircleQuestion, title: "Ask questions", body: "Stuck on a step? Someone has probably solved it." },
          { icon: Share2, title: "Share progress", body: "Post your wins and projects to stay motivated." },
          { icon: HeartHandshake, title: "Help others", body: "Teaching is the best way to lock in what you learn." },
          { icon: Megaphone, title: "Stay updated", body: "Get announcements about new features and events." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-5 shadow-xs">
            <f.icon className="size-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">{f.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
