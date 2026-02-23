import { test, expect, describe } from "bun:test";
import { shouldRunInteractive } from "../src/cli.ts";

describe("shouldRunInteractive", () => {
  test("returns true for empty argv", () => {
    expect(shouldRunInteractive([])).toBe(true);
  });

  test("returns true for -i flag", () => {
    expect(shouldRunInteractive(["-i"])).toBe(true);
  });

  test("returns true for --interactive flag", () => {
    expect(shouldRunInteractive(["--interactive"])).toBe(true);
  });

  test("returns false when other args are present", () => {
    expect(shouldRunInteractive(["-p", "week"])).toBe(false);
  });

  test("returns true for -i mixed with other args", () => {
    expect(shouldRunInteractive(["-i", "-p", "week"])).toBe(true);
  });

  test("returns true for --interactive mixed with other args", () => {
    expect(shouldRunInteractive(["--interactive", "--org", "myorg"])).toBe(true);
  });
});
