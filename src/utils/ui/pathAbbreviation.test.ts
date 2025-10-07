import { abbreviatePath } from "./pathAbbreviation";

describe("abbreviatePath", () => {
  it("should abbreviate all directory components except the last one", () => {
    expect(abbreviatePath("/Users/ammar/Projects/coder/cmux")).toBe("/U/a/P/c/cmux");
  });

  it("should handle paths without leading slash", () => {
    expect(abbreviatePath("Users/ammar/Projects/coder/cmux")).toBe("U/a/P/c/cmux");
  });

  it("should handle single directory paths", () => {
    expect(abbreviatePath("/Users")).toBe("/Users");
    expect(abbreviatePath("Users")).toBe("Users");
  });

  it("should handle root path", () => {
    expect(abbreviatePath("/")).toBe("/");
  });

  it("should handle empty string", () => {
    expect(abbreviatePath("")).toBe("");
  });

  it("should handle paths with multiple character directories", () => {
    expect(abbreviatePath("/home/username/Documents/project")).toBe("/h/u/D/project");
  });

  it("should preserve the full last directory name", () => {
    expect(abbreviatePath("/Users/ammar/very-long-project-name")).toBe(
      "/U/a/very-long-project-name"
    );
  });
});
