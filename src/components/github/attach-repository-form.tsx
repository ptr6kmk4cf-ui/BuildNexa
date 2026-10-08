"use client";

import { useActionState } from "react";
import { attachRepository } from "@/server/actions/github";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { RepositoryChoice } from "@/components/projects/create-project-dialog";

export function AttachRepositoryForm({
  projectId,
  repositories,
}: {
  projectId: string;
  repositories: RepositoryChoice[];
}) {
  const [state, formAction, pending] = useActionState(attachRepository, { message: null });

  return (
    <form action={formAction} className="mt-4 grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-2">
        <Label htmlFor="attach-repository">Attach a connected repository</Label>
        <NativeSelect id="attach-repository" name="repositoryId" defaultValue={repositories[0]?.id ?? ""} required>
          {repositories.map((repository) => (
            <option key={repository.id} value={repository.id}>
              {repository.fullName} · {repository.defaultBranch}
            </option>
          ))}
        </NativeSelect>
      </div>
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Attaching..." : "Attach repository"}
      </Button>
    </form>
  );
}
