import { describe, expect, it } from "vitest";
import { InputValidationError } from "@/lib/errors";
import {
  createProjectInputSchema,
  idSchema,
  paginationSchema,
  parseInput,
} from "@/lib/validation";

describe("validation", () => {
  it("trims a project name and drops blank optional fields", () => {
    const input = parseInput(createProjectInputSchema, {
      name: "  Billing export  ",
      description: "   ",
      objective: " Ship the CSV ",
    });
    expect(input).toEqual({
      name: "Billing export",
      description: undefined,
      objective: "Ship the CSV",
    });
  });

  it("rejects a short project name and a repository id that is not a cuid", () => {
    expect(() => parseInput(createProjectInputSchema, { name: "A" })).toThrow(InputValidationError);
    expect(() =>
      parseInput(createProjectInputSchema, { name: "Authentication Upgrade", repositoryId: "mycompany/myapp" }),
    ).toThrow(InputValidationError);
    expect(
      parseInput(createProjectInputSchema, {
        name: "Authentication Upgrade",
        repositoryId: "cjld2cjxh0000qzrmn831i7rn",
      }).repositoryId,
    ).toBe("cjld2cjxh0000qzrmn831i7rn");
  });

  it("applies pagination bounds", () => {
    expect(parseInput(paginationSchema, {})).toEqual({ limit: 50 });
    expect(parseInput(paginationSchema, { limit: "25" })).toEqual({ limit: 25 });
    expect(() => parseInput(paginationSchema, { limit: 0 })).toThrow(InputValidationError);
    expect(() => parseInput(paginationSchema, { limit: 101 })).toThrow(InputValidationError);
  });

  it("accepts a cuid and rejects a raw slug", () => {
    expect(idSchema.safeParse("cjld2cjxh0000qzrmn831i7rn").success).toBe(true);
    expect(idSchema.safeParse("billing-export").success).toBe(false);
  });
});
