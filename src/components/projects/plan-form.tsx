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
  const restore = state.status === "error";
  const repositoryValue = restore ? state.values.repositoryId : repositoryDefault;

  return (
    <form
      action={formAction}
      className="grid gap-5"
      key={
        restore
          ? `${state.values.goal}\0${state.values.budget}\0${state.values.optimizationMode}\0${state.values.repositoryId}\0${state.message ?? ""}`
          : "new"
      }
    >
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
          defaultValue={state.values.goal}
          aria-invalid={Boolean(state.fieldErrors.goal)}
          aria-describedby={state.fieldErrors.goal ? "plan-goal-error plan-goal-hint" : "plan-goal-hint"}
        />
        <p id="plan-goal-hint" className="text-xs text-muted-foreground">
          Describe the software change. The project name is taken from the first clause. Planning builds a task graph and can record a model choice. It does not call the model, edit files, or open a pull request.
        </p>
        {state.fieldErrors.goal ? (
          <p id="plan-goal-error" role="alert" className="text-xs text-destructive">
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
            defaultValue={state.values.budget}
            aria-invalid={Boolean(state.fieldErrors.budget)}
            aria-describedby={state.fieldErrors.budget ? "plan-budget-error plan-budget-hint" : "plan-budget-hint"}
          />
          <p id="plan-budget-hint" className="text-xs text-muted-foreground">
            Stored as the project limit. This step does not spend it.
          </p>
          {state.fieldErrors.budget ? (
            <p id="plan-budget-error" role="alert" className="text-xs text-destructive">
              {state.fieldErrors.budget.join(" ")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plan-mode">Optimization mode</Label>
          <NativeSelect
            id="plan-mode"
            name="optimizationMode"
            defaultValue={state.values.optimizationMode || "balanced"}
            aria-invalid={Boolean(state.fieldErrors.optimizationMode)}
            aria-describedby={state.fieldErrors.optimizationMode ? "plan-mode-error plan-mode-hint" : "plan-mode-hint"}
          >
            <option value="savings">Savings — shorter plan</option>
            <option value="balanced">Balanced — standard delivery order</option>
            <option value="quality">Quality — extra planning and documentation</option>
          </NativeSelect>
          <p id="plan-mode-hint" className="text-xs text-muted-foreground">
            Changes the task graph and how routing weighs cost against quality. It does not call a model.
          </p>
          {state.fieldErrors.optimizationMode ? (
            <p id="plan-mode-error" role="alert" className="text-xs text-destructive">
              {state.fieldErrors.optimizationMode.join(" ")}
            </p>
          ) : null}
        </div>
      </div>
      {repositories.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor="plan-repository">Repository</Label>
          <NativeSelect
            key={repositoryValue || "none"}
            id="plan-repository"
            name="repositoryId"
            defaultValue={repositoryValue}
            aria-invalid={Boolean(state.fieldErrors.repositoryId)}
            aria-describedby={
              state.fieldErrors.repositoryId ? "plan-repository-error plan-repository-hint" : "plan-repository-hint"
            }
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
            <p id="plan-repository-error" role="alert" className="text-xs text-destructive">
              {state.fieldErrors.repositoryId.join(" ")}
            </p>
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
