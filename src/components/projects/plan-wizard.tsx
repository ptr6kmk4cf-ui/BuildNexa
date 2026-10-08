"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { planDraftKey, reviewedPlanIsCurrent, type PlanPreview } from "@/lib/dashboard/preview";
import { taskMarker } from "@/lib/dashboard/status";
import { labelTaskType } from "@/lib/labels";
import { initialPlanProjectFormState } from "@/lib/project-form";
import { planProject } from "@/server/actions/plan-project";
import { previewProjectPlan } from "@/server/actions/preview-plan";

const STEPS = ["Repository", "Objective", "Budget", "Mode", "Review", "Start"] as const;
const BUDGETS = [
  { value: "5", label: "$5", detail: "A short change" },
  { value: "25", label: "$25", detail: "A feature with tests" },
  { value: "100", label: "$100", detail: "A larger change" },
] as const;
const MODES = [
  { value: "savings", label: "Savings", detail: "Prefer the cheaper model that can do the task." },
  { value: "balanced", label: "Balanced", detail: "Trade cost against the chance the task succeeds." },
  { value: "quality", label: "Quality", detail: "Prefer the model with the stronger success estimate." },
] as const;

type RepositoryOption = {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

export function PlanWizard({
  repositories,
  defaultRepositoryId,
}: {
  repositories: RepositoryOption[];
  defaultRepositoryId?: string;
}) {
  const [step, setStep] = useState(0);
  const [repositoryId, setRepositoryId] = useState(defaultRepositoryId ?? "");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("25");
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("balanced");
  const [localError, setLocalError] = useState<string | null>(null);
  const [review, setReview] = useState<PlanPreview | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const reviewRequest = useRef(0);
  const [state, formAction, pending] = useActionState(planProject, initialPlanProjectFormState);
  const draftKey = planDraftKey({ repositoryId, goal, budget, mode });
  const reviewCurrent = review?.ok === true && reviewedPlanIsCurrent(reviewedKey, draftKey);

  async function loadReview() {
    const requestId = reviewRequest.current + 1;
    reviewRequest.current = requestId;
    const key = planDraftKey({ repositoryId, goal, budget, mode });
    const data = new FormData();
    data.set("goal", goal);
    data.set("budget", budget);
    data.set("optimizationMode", mode);
    if (repositoryId) data.set("repositoryId", repositoryId);
    setReviewing(true);
    const result = await previewProjectPlan(data);
    if (requestId !== reviewRequest.current) return null;
    setReview(result);
    setReviewedKey(result.ok ? key : null);
    setReviewing(false);
    return result;
  }

  function continueStep() {
    const error = stepError(step, goal, budget);
    setLocalError(error);
    if (error) return;
    if (step === 3) {
      void loadReview().then((result) => {
        if (!result) return;
        if (result.ok) setStep(4);
        else setLocalError(result.message);
      });
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  const serverError = state.status === "error"
    ? state.fieldErrors.goal?.[0]
      ?? state.fieldErrors.budget?.[0]
      ?? state.fieldErrors.optimizationMode?.[0]
      ?? state.fieldErrors.repositoryId?.[0]
      ?? state.message
    : null;
  const alert = serverError ?? localError;
  const titles = review?.ok ? new Map(review.tasks.map((task) => [task.id, task.title])) : new Map<string, string>();

  return (
    <div className="grid gap-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Project setup">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              className={index === step ? "w-full rounded-lg bg-primary px-2 py-2 text-left text-xs font-medium text-primary-foreground" : "w-full rounded-lg border border-border px-2 py-2 text-left text-xs text-muted-foreground"}
              aria-current={index === step ? "step" : undefined}
              disabled={index > step || (index === 5 && !reviewCurrent)}
              onClick={() => {
                if (index > step || (index === 5 && !reviewCurrent)) return;
                setLocalError(null);
                if (index === 4) void loadReview();
                setStep(index);
              }}
            >
              <span className="block tabular-nums">{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {alert ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {alert}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="grid gap-3" aria-labelledby="step-repository">
          <h2 id="step-repository" className="font-heading text-xl">Connect a repository</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose a GitHub repository already connected to this workspace. The plan uses its name, branch, and description. You can also continue without one.
          </p>
          {repositories.length === 0 ? (
            <p className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
              No repository is connected. Continue to describe the objective, or connect GitHub first and come back.
            </p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="repositoryId">Repository</Label>
              <NativeSelect id="repositoryId" value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)}>
                <option value="">No repository</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.fullName} · {repository.defaultBranch} · {repository.private ? "Private" : "Public"}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="grid gap-3" aria-labelledby="step-objective">
          <h2 id="step-objective" className="font-heading text-xl">Describe the objective</h2>
          <Label htmlFor="goal">What should the software do when this work is done?</Label>
          <Textarea
            id="goal"
            name="goal"
            required
            minLength={12}
            maxLength={4000}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Add Google and Apple authentication, update the database, create the API endpoints, build the login interface, add tests, and prepare a pull request."
          />
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-3" aria-labelledby="step-budget">
          <h2 id="step-budget" className="font-heading text-xl">Choose a budget</h2>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Budget">
            {BUDGETS.map((choice) => (
              <label key={choice.value} className={budget === choice.value ? "rounded-xl border border-primary bg-card px-4 py-3" : "rounded-xl border border-border bg-card px-4 py-3"}>
                <input
                  type="radio"
                  name="budgetChoice"
                  className="sr-only"
                  value={choice.value}
                  checked={budget === choice.value}
                  onChange={() => setBudget(choice.value)}
                />
                <span className="block font-heading text-2xl tabular-nums">{choice.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{choice.detail}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-3" aria-labelledby="step-mode">
          <h2 id="step-mode" className="font-heading text-xl">Choose how to pick models</h2>
          <div className="grid gap-2" role="radiogroup" aria-label="Optimization mode">
            {MODES.map((choice) => (
              <label key={choice.value} className={mode === choice.value ? "rounded-xl border border-primary bg-card px-4 py-3" : "rounded-xl border border-border bg-card px-4 py-3"}>
                <input
                  type="radio"
                  name="modeChoice"
                  className="sr-only"
                  value={choice.value}
                  checked={mode === choice.value}
                  onChange={() => setMode(choice.value)}
                />
                <span className="block text-sm font-medium">{choice.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{choice.detail}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="grid gap-3" aria-labelledby="step-review">
          <h2 id="step-review" className="font-heading text-xl">Review the plan</h2>
          {reviewing && !review ? <p role="status" className="text-sm text-muted-foreground">Building the plan...</p> : null}
          {review?.ok ? (
            <>
              <p className="max-w-3xl text-sm leading-6">{review.summary}</p>
              <p className="text-xs text-muted-foreground">This review is the planner output. Nothing is saved until you start.</p>
              <ol className="grid gap-2" aria-label="Planned tasks">
                {review.tasks.map((task) => {
                  const marker = taskMarker(null, "PENDING");
                  return (
                    <li key={task.id} className="rounded-xl border border-border bg-card px-4 py-3">
                      <p className="text-sm font-medium">
                        <span aria-hidden="true">{marker.symbol} </span>
                        <span className="sr-only">{marker.label}. </span>
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {labelTaskType(task.type)}
                        {task.dependencies.length > 0
                          ? ` · Depends on ${task.dependencies.map((id) => titles.get(id) ?? id).join(", ")}`
                          : " · Starts the plan"}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : review && !review.ok ? (
            <p role="alert" className="text-sm text-destructive">{review.message}</p>
          ) : null}
        </section>
      ) : null}

      {step === 5 ? (
        <section className="grid gap-3" aria-labelledby="step-start">
          <h2 id="step-start" className="font-heading text-xl">Start</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Start saves this plan, records a model for each task, and runs the tasks. Save the plan if you want to look at the project before a model is called.
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Repository</dt>
              <dd className="mt-1">{repositories.find((item) => item.id === repositoryId)?.fullName ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Budget</dt>
              <dd className="mt-1 tabular-nums">${budget}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Mode</dt>
              <dd className="mt-1">{MODES.find((item) => item.value === mode)?.label}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Tasks</dt>
              <dd className="mt-1">{review?.ok ? review.tasks.length : "Not available"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger render={<Button type="button" disabled={pending || !reviewCurrent}>Start</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start this project?</DialogTitle>
                  <DialogDescription>
                    The selected models will be called, then the project checks will run. Spend is kept inside the ${budget} budget unless a later run is allowed to go over it.
                  </DialogDescription>
                </DialogHeader>
                <form action={formAction}>
                  <HiddenPlan repositoryId={repositoryId} goal={goal} budget={budget} mode={mode} start />
                  <DialogFooter>
                    <DialogClose render={<Button type="button" variant="outline">Go back</Button>} />
                    <Button type="submit" disabled={pending}>{pending ? "Starting..." : "Start project"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <form action={formAction}>
              <HiddenPlan repositoryId={repositoryId} goal={goal} budget={budget} mode={mode} />
              <Button type="submit" variant="outline" disabled={pending || !reviewCurrent}>
                {pending ? "Saving..." : "Save plan"}
              </Button>
            </form>
          </div>
        </section>
      ) : null}

      {step < 5 ? (
        <div className="flex flex-wrap gap-2">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)}>
              Back
            </Button>
          ) : null}
          <Button type="button" onClick={continueStep} disabled={step === 4 && !reviewCurrent}>
            Continue
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setStep(4)}>
          Back
        </Button>
      )}
    </div>
  );
}

function HiddenPlan({
  repositoryId,
  goal,
  budget,
  mode,
  start = false,
}: {
  repositoryId: string;
  goal: string;
  budget: string;
  mode: string;
  start?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="repositoryId" value={repositoryId} />
      <input type="hidden" name="goal" value={goal} />
      <input type="hidden" name="budget" value={budget} />
      <input type="hidden" name="optimizationMode" value={mode} />
      {start ? <input type="hidden" name="startExecution" value="on" /> : null}
    </>
  );
}

function stepError(step: number, goal: string, budget: string): string | null {
  if (step === 1 && goal.trim().length < 12) return "Describe the software change in at least a short sentence.";
  if (step === 1 && goal.trim().length > 4000) return "The goal must be 4000 characters or fewer.";
  if (step === 2 && !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(budget)) return "Enter a USD budget such as 25 or 25.00.";
  return null;
}
