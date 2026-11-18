"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, PlayCircle, ShoppingBag } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { enrollFreeAction, startCheckoutAction } from "@/lib/actions/marketplace";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function EnrollButton({
  courseId,
  priceAmount,
  currency,
  signedIn,
  className,
}: {
  courseId: string;
  priceAmount: number;
  currency: string;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const paid = priceAmount > 0;
  const cls = cn(buttonVariants({ size: "lg" }), "h-12 w-full rounded-xl text-[15px]", className);

  if (!signedIn) {
    const next = encodeURIComponent(`/dashboard/courses/${courseId}`);
    return (
      <Link href={`/signup?next=${next}`} className={cls}>
        {paid ? <Lock /> : <PlayCircle />}
        {paid ? `Sign up to buy · ${formatMoney(priceAmount, currency)}` : "Sign up to enroll for free"}
      </Link>
    );
  }

  const go = () =>
    start(async () => {
      if (paid) {
        const res = await startCheckoutAction(courseId);
        if (!res.ok) return void toast.error(res.error);
        window.location.assign(res.data.url);
        return;
      }
      const res = await enrollFreeAction(courseId);
      if (!res.ok) return void toast.error(res.error);
      toast.success("You're enrolled — enjoy the course!");
      router.push(`/dashboard/courses/${courseId}/learn`);
      router.refresh();
    });

  return (
    <Button size="lg" className={cls} onClick={go} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : paid ? <ShoppingBag /> : <PlayCircle />}
      {paid ? `Buy course · ${formatMoney(priceAmount, currency)}` : "Enroll for free"}
    </Button>
  );
}
