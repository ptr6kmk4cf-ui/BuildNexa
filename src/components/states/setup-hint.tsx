export function SetupHint() {
  return (
    <ol className="mx-auto mt-4 max-w-md list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
      <li>
        Start Postgres with <code className="font-mono text-xs text-foreground">docker compose up -d</code>.
      </li>
      <li>
        Copy <code className="font-mono text-xs text-foreground">.env.example</code> to{" "}
        <code className="font-mono text-xs text-foreground">.env</code>.
      </li>
      <li>
        Apply the schema with{" "}
        <code className="font-mono text-xs text-foreground">npx prisma migrate dev</code>.
      </li>
    </ol>
  );
}
