import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type PublicErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function toPublicError(error: unknown): { status: number; body: PublicErrorBody } {
  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error(error.message, { code: error.code });
    }
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  logger.error("Unhandled server error", { error });
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Something went wrong.",
      },
    },
  };
}
