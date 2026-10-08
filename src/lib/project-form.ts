export type CreateProjectFieldErrors = {
  name?: string[];
  description?: string[];
  objective?: string[];
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
