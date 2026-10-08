"use client";

import { useActionState } from "react";
import { planProject } from "@/server/actions/plan-project";
import { initialPlanProjectFormState } from "@/lib/project-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export type PlanRepositoryChoice = {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

export function PlanForm({
  repositories,
  defaultRepositoryId,
}: {
  repositories: PlanRepositoryChoice[];
  defaultRepositoryId?: string;
}) {
  const [state, formAction, pending] = useActionState(planProject, initialPlanProjectFormState);
  const repositoryDefault = repositories.some((repository) => repository.id === defaultRepositoryId)
    ? defaultRepositoryId
    : "";

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="plan-goal">Goal</Label>
        <Textarea
          id="plan-goal"
          name="goal"
          required
          minLength={12}
          maxLength={4000}
          rows={6}
          placeholder="Add Google and Apple authentication, update the database, create the API endpoints, build the login interface, add tests, and prepare a pull request."
          aria-invalid={Boolean(state.fieldErrors.goal)}
          aria-describedby={state.fieldErrors.goal ? "plan-goal-error" : "plan-goal-hint"}
        />
        <p id="plan-goal-hint" className="text-xs text-muted-foreground">
          Describe the software change. The project name is taken from the first clause. Planning builds a task graph and does not call a model, edit files, or open a pull request.
        </p>
        {state.fieldErrors.goal ? (
          <p id="plan-goal-error" className="text-xs text-destructive">
            {state.fieldErrors.goal.join(" ")}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="plan-budget">Budget (USD)</Label>
          <Input
            id="plan-budget"
            name="budget"
            inputMode="decimal"
            required
            placeholder="25.00"
            aria-invalid={Boolean(state.fieldErrors.budget)}
            aria-describedby={state.fieldErrors.budget ? "plan-budget-error" : "plan-budget-hint"}
          />
          <p id="plan-budget-hint" className="text-xs text-muted-foreground">
            Stored as the project limit. This step does not spend it.
          </p>
          {state.fieldErrors.budget ? (
            <p id="plan-budget-error" className="text-xs text-destructive">
              {state.fieldErrors.budget.join(" ")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plan-mode">Optimization mode</Label>
          <NativeSelect
            id="plan-mode"
            name="optimizationMode"
            defaultValue="balanced"
            aria-invalid={Boolean(state.fieldErrors.optimizationMode)}
            aria-describedby={state.fieldErrors.optimizationMode ? "plan-mode-error" : "plan-mode-hint"}
          >
            <option value="savings">Savings — shorter plan</option>
            <option value="balanced">Balanced — standard delivery order</option>
            <option value="quality">Quality — extra planning and documentation</option>
          </NativeSelect>
          <p id="plan-mode-hint" className="text-xs text-muted-foreground">
            Changes how many tasks are created. It does not select a model.
          </p>
          {state.fieldErrors.optimizationMode ? (
            <p id="plan-mode-error" className="text-xs text-destructive">
              {state.fieldErrors.optimizationMode.join(" ")}
            </p>
          ) : null}
        </div>
      </div>
      {repositories.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor="plan-repository">Repository</Label>
          <NativeSelect
            key={repositoryDefault || "none"}
            id="plan-repository"
            name="repositoryId"
            defaultValue={repositoryDefault}
            aria-invalid={Boolean(state.fieldErrors.repositoryId)}
            aria-describedby="plan-repository-hint"
          >
            <option value="">No repository yet</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.fullName} · {repository.defaultBranch}
                {repository.private ? " · private" : ""}
              </option>
            ))}
          </NativeSelect>
          <p id="plan-repository-hint" className="text-xs text-muted-foreground">
            Only the name, branch, visibility, and description are used. The repository files stay unread.
          </p>
          {state.fieldErrors.repositoryId ? (
            <p className="text-xs text-destructive">{state.fieldErrors.repositoryId.join(" ")}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect GitHub if the plan should start from a repository. Without one, the analysis task records assumptions.
        </p>
      )}
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Planning..." : "Create plan"}
        </Button>
      </div>
    </form>
  );
}
