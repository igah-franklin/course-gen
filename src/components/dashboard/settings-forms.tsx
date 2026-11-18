"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEmailAction, changePasswordAction, updateProfileAction, type FormState } from "@/lib/actions/profile";

function Status({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
        <AlertCircle className="size-4" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="flex items-center gap-2 text-sm text-success" role="status">
        <CheckCircle2 className="size-4" /> {state.message}
      </p>
    );
  return null;
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-xs md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SettingsForms({ fullName, email, avatarUrl }: { fullName: string; email: string; avatarUrl: string | null }) {
  const [profile, profileAction, p1] = useActionState(updateProfileAction, {});
  const [emailState, emailAction, p2] = useActionState(changeEmailAction, {});
  const [pw, pwAction, p3] = useActionState(changePasswordAction, {});
  return (
    <div className="space-y-6">
      <Card title="Profile" description="Your name appears on your certificates.">
        <form action={profileAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" defaultValue={fullName} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatarUrl">Avatar URL (optional)</Label>
            <Input id="avatarUrl" name="avatarUrl" type="url" defaultValue={avatarUrl ?? ""} placeholder="https://…" />
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={p1}>
              {p1 && <Loader2 className="animate-spin" />} Save profile
            </Button>
            <Status state={profile} />
          </div>
        </form>
      </Card>
      <Card title="Email address" description="We'll send a confirmation link to the new address.">
        <form action={emailAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={email} required />
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" variant="outline" disabled={p2}>
              {p2 && <Loader2 className="animate-spin" />} Change email
            </Button>
            <Status state={emailState} />
          </div>
        </form>
      </Card>
      <Card title="Password" description="Use at least 8 characters.">
        <form action={pwAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" variant="outline" disabled={p3}>
              {p3 && <Loader2 className="animate-spin" />} Update password
            </Button>
            <Status state={pw} />
          </div>
        </form>
      </Card>
    </div>
  );
}
