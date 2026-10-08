"use client";

import { useActionState } from "react";
import { createProject } from "@/server/actions/create-project";
import { initialCreateProjectFormState } from "@/lib/project-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export type RepositoryChoice = {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  githubRepoId?: string;
};

export function CreateProjectDialog({
  repositories = [],
  defaultRepositoryId,
}: {
  repositories?: RepositoryChoice[];
  defaultRepositoryId?: string;
}) {
  const [state, formAction, pending] = useActionState(createProject, initialCreateProjectFormState);

  return (
    <Dialog>
      <DialogTrigger className={buttonVariants()}>New project</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Name the effort and, if GitHub is connected, start it from a repository you can
            access. This does not create a branch or open a pull request.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Authentication Upgrade"
              aria-invalid={Boolean(state.fieldErrors.name)}
              aria-describedby={state.fieldErrors.name ? "project-name-error" : undefined}
            />
            {state.fieldErrors.name ? (
              <p id="project-name-error" className="text-xs text-destructive">
                {state.fieldErrors.name.join(" ")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Input
              id="project-description"
              name="description"
              maxLength={500}
              placeholder="Optional, one line of context"
              aria-invalid={Boolean(state.fieldErrors.description)}
              aria-describedby={state.fieldErrors.description ? "project-description-error" : undefined}
            />
            {state.fieldErrors.description ? (
              <p id="project-description-error" className="text-xs text-destructive">
                {state.fieldErrors.description.join(" ")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-objective">Objective</Label>
            <Textarea
              id="project-objective"
              name="objective"
              maxLength={4000}
              placeholder="What should be true when this work is done?"
              aria-invalid={Boolean(state.fieldErrors.objective)}
              aria-describedby={state.fieldErrors.objective ? "project-objective-error" : undefined}
            />
            {state.fieldErrors.objective ? (
              <p id="project-objective-error" className="text-xs text-destructive">
                {state.fieldErrors.objective.join(" ")}
              </p>
            ) : null}
          </div>
          {repositories.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="project-repository">Repository</Label>
              <NativeSelect
                id="project-repository"
                name="repositoryId"
                defaultValue={defaultRepositoryId ?? ""}
                aria-invalid={Boolean(state.fieldErrors.repositoryId)}
                aria-describedby={state.fieldErrors.repositoryId ? "project-repository-error" : undefined}
              >
                <option value="">No repository yet</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.fullName} · {repository.defaultBranch}
                    {repository.private ? " · private" : ""}
                  </option>
                ))}
              </NativeSelect>
              {state.fieldErrors.repositoryId ? (
                <p id="project-repository-error" className="text-xs text-destructive">
                  {state.fieldErrors.repositoryId.join(" ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect GitHub first if this project should start from a repository.
            </p>
          )}
          {state.message ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
