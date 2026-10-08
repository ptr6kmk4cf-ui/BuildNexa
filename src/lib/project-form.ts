export type CreateProjectFieldErrors = {
  name?: string[];
  description?: string[];
  objective?: string[];
  repositoryId?: string[];
};

export type CreateProjectFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: CreateProjectFieldErrors;
};

export const initialCreateProjectFormState: CreateProjectFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};

export type PlanProjectFieldErrors = {
  goal?: string[];
  budget?: string[];
  optimizationMode?: string[];
  repositoryId?: string[];
};

export type PlanProjectFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: PlanProjectFieldErrors;
};

export const initialPlanProjectFormState: PlanProjectFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};
