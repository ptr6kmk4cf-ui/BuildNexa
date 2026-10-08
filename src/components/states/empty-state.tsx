export function EmptyState({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <h2 className="font-heading text-xl text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      {children}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
