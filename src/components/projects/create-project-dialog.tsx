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
import { Textarea } from "@/components/ui/textarea";

export function CreateProjectDialog() {
  const [state, formAction, pending] = useActionState(createProject, initialCreateProjectFormState);

  return (
    <Dialog>
      <DialogTrigger className={buttonVariants()}>New project</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Name the effort and write the objective in plain language. Tasks, model choices, and
            pull requests are stored later. This phase only keeps the record.
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
              placeholder="Billing export"
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
