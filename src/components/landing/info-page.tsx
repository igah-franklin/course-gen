export function InfoPage({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      {intro ? <p className="mt-4 text-lg text-muted-foreground">{intro}</p> : null}
      <div className="prose-lesson mt-10 [&_h2]:mt-10">{children}</div>
    </div>
  );
}
