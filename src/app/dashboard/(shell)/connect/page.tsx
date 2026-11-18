import type { Metadata } from "next";
import { Bot, CheckCircle2, Plug, Sparkles, Terminal } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listConnections, mcpResource } from "@/lib/oauth/server";
import { revokeConnectionAction } from "@/lib/actions/connections";
import { publicEnv } from "@/lib/env";
import { requestNow } from "@/lib/utils/time";
import { ClaudeIcon } from "@/components/brand/brand-icons";
import { ActionButton } from "@/components/admin/action-button";
import { CopyField } from "@/components/shared/copy-field";
import { PageHeader, SectionCard, relativeTime } from "@/components/shared/ui-bits";

export const metadata: Metadata = { title: "Connect AI" };

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function ConnectPage() {
  const user = await requireUser("/dashboard/connect");
  const connections = await listConnections(user.id);
  const url = mcpResource();
  const now = requestNow();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Connect your AI"
        description="Generate courses with your own Claude or ChatGPT subscription — no API keys. Your assistant does the writing; we check every lesson for completeness and save it to your dashboard."
      />

      <SectionCard title="Your connector URL" description="Add this as a custom connector (remote MCP server) in Claude or ChatGPT.">
        <CopyField value={url} label="MCP server URL" />
        <p className="mt-3 text-xs text-muted-foreground">
          When asked, sign in with your {publicEnv.appName} account and click <strong>Allow access</strong>. No keys or passwords are shared with the AI app.
        </p>
      </SectionCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <ClaudeIcon className="size-4 text-[#D97757]" /> Claude (claude.ai or Claude Desktop)
            </span>
          }
        >
          <Steps
            items={[
              <>Open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>.</>,
              <>Name it “{publicEnv.appName}” and paste the connector URL above.</>,
              <>Click <strong>Connect</strong>, sign in here, and allow access.</>,
              <>In a new chat, enable the connector from the tools menu and paste a prompt below.</>,
            ]}
          />
        </SectionCard>
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Bot className="size-4 text-foreground" /> ChatGPT
            </span>
          }
        >
          <Steps
            items={[
              <>Open <strong>Settings → Apps &amp; Connectors</strong>. If custom connectors are hidden, turn on <strong>Developer mode</strong> under Advanced.</>,
              <>Create a connector named “{publicEnv.appName}”, paste the connector URL, and choose <strong>OAuth</strong> authentication.</>,
              <>Sign in here when prompted and allow access.</>,
              <>Start a chat, add the connector from the tools menu, and paste a prompt below.</>,
            ]}
          />
        </SectionCard>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Menu names vary by app version, and custom connectors may require a paid plan. Generation uses your assistant&apos;s usage allowance.
      </p>

      <SectionCard title="Prompts to use" className="mt-6">
        <div className="space-y-3">
          {[
            {
              label: "From a YouTube video",
              value: `Use ${publicEnv.appName} to create a complete course from https://www.youtube.com/watch?v=VIDEO_ID — keep completing each task until the course is done.`,
            },
            {
              label: "From a prompt (no material needed)",
              value: `Use ${publicEnv.appName} to create a beginner course on TOPIC for AUDIENCE. It must cover: … Keep completing each task until the course is done.`,
            },
            {
              label: "From a document (attach a PDF/DOCX to the chat, or give a link)",
              value: `Use ${publicEnv.appName} to create a complete course from the document I've attached — pass its full text, then keep completing each task until the course is done.`,
            },
            {
              label: "From an article",
              value: `Use ${publicEnv.appName} to create a complete course from this article: https://… — keep completing each task until the course is done.`,
            },
            {
              label: "From a recording (public audio/video link)",
              value: `Use ${publicEnv.appName} to create a complete course from this recording: https://…/lecture.mp4 — keep completing each task until the course is done.`,
            },
            {
              label: "Let the platform write it in the background",
              value: `Use ${publicEnv.appName} to create a course on TOPIC with writer "platform", then tell me when it's ready.`,
            },
          ].map((p) => (
            <div key={p.label}>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5" /> {p.label}
              </p>
              <CopyField multiline value={p.value} />
            </div>
          ))}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" /> Continue a course (e.g. in a new chat)
            </p>
            <CopyField multiline value={`Continue generating my ${publicEnv.appName} course — list my courses and pick up the one that's still generating.`} />
          </div>
        </div>
        <details className="mt-5 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-primary">
            <Terminal className="size-3.5" /> Using Claude Code?
          </summary>
          <CopyField className="mt-3" value={`claude mcp add --transport http courseforge ${url}`} />
        </details>
      </SectionCard>

      <SectionCard title="How it works" className="mt-6">
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            "We fetch and read the source on our side — video transcript, document, article or recording — or start from your brief.",
            "Your assistant analyses the source section by section (or plans the syllabus from your brief) and writes each lesson.",
            "Every submission is checked: lessons that skip teaching points are sent back to be fixed.",
            "Progress is saved after every step — say “continue” in any new chat to resume.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {t}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Connected apps" description="Apps that can use your account through the connector." className="mt-6">
        {connections.length ? (
          <ul className="divide-y">
            {connections.map((c) => (
              <li key={c.clientId} className="flex items-center gap-3 py-3">
                <Plug className="size-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Connected {relativeTime(c.connectedAt, now)} · last used {relativeTime(c.lastUsedAt, now)}
                  </p>
                </div>
                <ActionButton
                  action={revokeConnectionAction.bind(null, c.clientId)}
                  label="Disconnect"
                  success="Disconnected"
                  confirm={`Disconnect ${c.name}? It will need to sign in again to use your account.`}
                  variant="ghost"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No apps connected yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
