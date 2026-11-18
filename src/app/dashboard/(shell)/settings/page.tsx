import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { SettingsForms } from "@/components/dashboard/settings-forms";
import { PageHeader } from "@/components/shared/ui-bits";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Manage your profile and account security." />
      <SettingsForms fullName={user.fullName} email={user.email} avatarUrl={user.avatarUrl} />
      <form action="/auth/signout" method="post" className="mt-8 flex justify-end">
        <button className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Sign out of this device</button>
      </form>
    </div>
  );
}
