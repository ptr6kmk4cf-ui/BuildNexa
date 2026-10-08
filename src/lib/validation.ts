import { z } from "zod";
import { InputValidationError } from "@/lib/errors";

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    const existing = grouped[path] ?? [];
    existing.push(issue.message);
    grouped[path] = existing;
  }
  return grouped;
}

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new InputValidationError(fieldErrorsFromZod(result.error));
  }
  return result.data;
}

const optionalFormText = (max: number, label: string) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().max(max, `${label} must be ${max} characters or fewer.`).optional());

export const createProjectInputSchema = z.object({
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .min(2, "Name must be at least 2 characters.")
      .max(80, "Name must be 80 characters or fewer."),
  ),
  description: optionalFormText(500, "Description"),
  objective: optionalFormText(4000, "Objective"),
  repositoryId: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.cuid("Choose a connected repository.").optional()),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const planProjectInputSchema = z.object({
  goal: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .min(12, "Describe the software change in at least a short sentence.")
      .max(4000, "The goal must be 4000 characters or fewer."),
  ),
  budget: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/, "Enter a USD budget such as 25 or 25.00."),
  ),
  optimizationMode: z.enum(["savings", "balanced", "quality"], {
    error: "Choose Savings, Balanced, or Quality.",
  }),
  repositoryId: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.cuid("Choose a connected repository.").optional()),
});

export type PlanProjectInput = z.infer<typeof planProjectInputSchema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const idSchema = z.cuid();
