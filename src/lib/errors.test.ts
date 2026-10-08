import { describe, expect, it, vi } from "vitest";
import { AppError, InputValidationError, uniqueRecordMessage } from "@/lib/errors";
import { toPublicError } from "@/lib/http";

describe("error handling", () => {
  it("publishes application errors without extra internals", () => {
    const error = new InputValidationError({ name: ["Name must be at least 2 characters."] });
    const result = toPublicError(error);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("invalid_input");
    expect(result.body.error.message).toBe("Input is invalid.");
  });

  it("hides unexpected error text, including connection strings", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connect failed postgresql://user:supersecret@127.0.0.1:5432/db");
    const result = toPublicError(error);
    expect(result.status).toBe(500);
    expect(result.body.error).toEqual({
      code: "internal_error",
      message: "Something went wrong.",
    });
    expect(JSON.stringify(result)).not.toContain("supersecret");
    expect(errorSpy.mock.calls.join(" ")).not.toContain("supersecret");
    expect(errorSpy.mock.calls.join(" ")).toContain("postgresql://[redacted]");
    errorSpy.mockRestore();
  });

  it("names a slug conflict separately from a repository conflict", () => {
    expect(uniqueRecordMessage({ code: "P2002", meta: { target: ["userId", "slug"] } })).toBe(
      "A project with that name already exists. Adjust the goal and try again.",
    );
    expect(uniqueRecordMessage({ code: "P2002", meta: { target: ["connectedRepositoryId"] } })).toBe(
      "That repository is already attached to a project.",
    );
    expect(uniqueRecordMessage(new Error("duplicate"))).toBeNull();
  });

  it("keeps a safe message on AppError", () => {
    const error = new AppError("A unique project address could not be created.", {
      code: "slug_exhausted",
      status: 409,
    });
    expect(toPublicError(error).body.error.message).toBe("A unique project address could not be created.");
  });
});
