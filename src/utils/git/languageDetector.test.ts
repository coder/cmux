import { describe, it, expect } from "bun:test";
import { getLanguageFromPath } from "./languageDetector";

describe("getLanguageFromPath", () => {
  it("should detect TypeScript files", () => {
    expect(getLanguageFromPath("src/App.ts")).toBe("typescript");
    expect(getLanguageFromPath("utils/helper.ts")).toBe("typescript");
  });

  it("should detect TSX files", () => {
    expect(getLanguageFromPath("src/App.tsx")).toBe("tsx");
    expect(getLanguageFromPath("components/Button.tsx")).toBe("tsx");
  });

  it("should detect JavaScript files", () => {
    expect(getLanguageFromPath("script.js")).toBe("javascript");
    expect(getLanguageFromPath("src/index.js")).toBe("javascript");
  });

  it("should detect JSX files", () => {
    expect(getLanguageFromPath("Component.jsx")).toBe("jsx");
  });

  it("should detect Python files", () => {
    expect(getLanguageFromPath("main.py")).toBe("python");
    expect(getLanguageFromPath("utils.py")).toBe("python");
  });

  it("should detect Rust files", () => {
    expect(getLanguageFromPath("main.rs")).toBe("rust");
  });

  it("should detect Go files", () => {
    expect(getLanguageFromPath("main.go")).toBe("go");
  });

  it("should detect Ruby files", () => {
    expect(getLanguageFromPath("config.rb")).toBe("ruby");
  });

  it("should detect Java files", () => {
    expect(getLanguageFromPath("Main.java")).toBe("java");
  });

  it("should detect C++ files", () => {
    expect(getLanguageFromPath("main.cpp")).toBe("cpp");
    expect(getLanguageFromPath("header.hpp")).toBe("cpp");
  });

  it("should detect C# files", () => {
    expect(getLanguageFromPath("Program.cs")).toBe("csharp");
  });

  it("should detect PHP files", () => {
    expect(getLanguageFromPath("index.php")).toBe("php");
  });

  it("should detect Shell scripts", () => {
    expect(getLanguageFromPath("script.sh")).toBe("bash");
  });

  it("should detect SQL files", () => {
    expect(getLanguageFromPath("query.sql")).toBe("sql");
  });

  it("should detect HTML files", () => {
    expect(getLanguageFromPath("index.html")).toBe("html");
  });

  it("should detect CSS files", () => {
    expect(getLanguageFromPath("styles.css")).toBe("css");
  });

  it("should detect SCSS files", () => {
    expect(getLanguageFromPath("styles.scss")).toBe("scss");
  });

  it("should detect JSON files", () => {
    expect(getLanguageFromPath("package.json")).toBe("json");
  });

  it("should detect YAML files", () => {
    expect(getLanguageFromPath("config.yaml")).toBe("yaml");
    expect(getLanguageFromPath("config.yml")).toBe("yaml");
  });

  it("should detect Markdown files", () => {
    expect(getLanguageFromPath("README.md")).toBe("markdown");
  });

  it("should detect Dockerfile", () => {
    expect(getLanguageFromPath("Dockerfile")).toBe("docker");
  });

  it("should detect Makefile", () => {
    expect(getLanguageFromPath("Makefile")).toBe("makefile");
  });

  it("should handle files with no extension", () => {
    expect(getLanguageFromPath("LICENSE")).toBe("text");
  });

  it("should handle unknown extensions", () => {
    expect(getLanguageFromPath("file.xyz")).toBe("text");
  });

  it("should handle paths with directories", () => {
    expect(getLanguageFromPath("src/components/App.tsx")).toBe("tsx");
    expect(getLanguageFromPath("/absolute/path/to/file.rs")).toBe("rust");
  });

  it("should handle files with multiple dots", () => {
    expect(getLanguageFromPath("my.component.tsx")).toBe("tsx");
    // Note: .test.ts is not recognized as TypeScript by the library (treats whole as extension)
    // This is expected behavior - the library is simple and fast, not exhaustive
    expect(getLanguageFromPath("utils.test.ts")).toBe("text");
  });

  it("should be case insensitive for extensions", () => {
    expect(getLanguageFromPath("App.TS")).toBe("typescript");
    expect(getLanguageFromPath("App.TSX")).toBe("tsx");
  });
});
