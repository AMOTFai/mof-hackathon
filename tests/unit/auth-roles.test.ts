import { describe, expect, it } from "vitest";
import {
  homePath,
  isPublicPath,
  pathAllowed,
  pickPrimaryRole,
  safeNextPath,
} from "@/lib/auth/paths";

describe("auth paths", () => {
  it("picks the highest-priority event role", () => {
    expect(pickPrimaryRole(["participant", "judge"])).toBe("judge");
    expect(pickPrimaryRole(["recruiter", "admin", "organizer"])).toBe("admin");
    expect(pickPrimaryRole([])).toBeNull();
  });

  it("sends each role to its dashboard", () => {
    expect(homePath(["participant"], false)).toBe("/dashboard");
    expect(homePath(["judge"], false)).toBe("/judge");
    expect(homePath(["organizer"], false)).toBe("/organizer");
    expect(homePath(["admin"], false)).toBe("/organizer");
    expect(homePath(["recruiter"], false)).toBe("/recruiter");
    expect(homePath([], true)).toBe("/alumni");
    expect(homePath([], false)).toBe("/join");
  });

  it("blocks another role's routes", () => {
    expect(pathAllowed("/organizer", ["participant"], false)).toBe(false);
    expect(pathAllowed("/judge", ["participant"], false)).toBe(false);
    expect(pathAllowed("/dashboard", ["judge"], false)).toBe(false);
    expect(pathAllowed("/recruiter", ["organizer"], false)).toBe(false);
    expect(pathAllowed("/alumni", ["participant"], false)).toBe(false);
    expect(pathAllowed("/alumni", [], true)).toBe(true);
    expect(pathAllowed("/organizer", ["admin"], false)).toBe(true);
    expect(pathAllowed("/judge", ["judge"], false)).toBe(true);
  });

  it("rejects open redirects and treats auth pages as public", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/organizer")).toBe("/organizer");
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
  });
});
