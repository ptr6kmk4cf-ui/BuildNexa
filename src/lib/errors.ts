export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { code: string; status: number; details?: unknown; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export class EnvValidationError extends AppError {
  constructor(fields: { path: string; message: string }[]) {
    super("Server environment is invalid.", {
      code: "invalid_environment",
      status: 500,
      details: { fields },
    });
  }
}

export function uniqueRecordMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") return null;
  const meta = "meta" in error ? error.meta : null;
  const target = meta && typeof meta === "object" && meta !== null && "target" in meta ? meta.target : null;
  const fields = Array.isArray(target)
    ? target.map(String).join(" ")
    : typeof target === "string"
      ? target
      : "";
  if (/slug/i.test(fields)) {
    return "A project with that name already exists. Adjust the goal and try again.";
  }
  if (/repository/i.test(fields)) {
    return "That repository is already attached to a project.";
  }
  return "That record conflicts with one already stored.";
}

export class InputValidationError extends AppError {
  constructor(fieldErrors: Record<string, string[]>) {
    super("Input is invalid.", {
      code: "invalid_input",
      status: 400,
      details: { fieldErrors },
    });
  }
}
