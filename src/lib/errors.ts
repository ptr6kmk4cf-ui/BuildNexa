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

export class InputValidationError extends AppError {
  constructor(fieldErrors: Record<string, string[]>) {
    super("Input is invalid.", {
      code: "invalid_input",
      status: 400,
      details: { fieldErrors },
    });
  }
}
