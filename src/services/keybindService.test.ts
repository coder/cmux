import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { KeybindService } from "./keybindService";
import type { KeybindsConfig } from "@/types/keybinds";

describe("KeybindService", () => {
  let tempDir: string;
  let service: KeybindService;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "keybind-test-"));
    service = new KeybindService(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("loadKeybinds returns empty array when file doesn't exist", () => {
    const keybinds = service.loadKeybinds();
    expect(keybinds).toEqual([]);
  });

  test("saveKeybinds creates file with valid JSON", () => {
    const keybinds: KeybindsConfig = [
      { key: "F1", action: { type: "send_message", message: "test" } },
    ];

    service.saveKeybinds(keybinds);

    const keybindsFile = path.join(tempDir, "keybinds.jsonc");
    expect(fs.existsSync(keybindsFile)).toBe(true);

    const content = fs.readFileSync(keybindsFile, "utf-8");
    expect(content).toContain("// Cmux F-Key Keybinds Configuration");
    expect(content).toContain('"key": "F1"');
    expect(content).toContain('"message": "test"');
  });

  test("loadKeybinds reads saved keybinds", () => {
    const original: KeybindsConfig = [
      { key: "F1", action: { type: "send_message", message: "hello" } },
      { key: "F2", action: { type: "send_message", message: "world" } },
    ];

    service.saveKeybinds(original);
    const loaded = service.loadKeybinds();

    expect(loaded).toEqual(original);
  });

  test("loadKeybinds handles JSONC with comments", () => {
    const keybindsFile = path.join(tempDir, "keybinds.jsonc");
    const content = `
// This is a comment
[
  // Another comment
  { "key": "F1", "action": { "type": "send_message", "message": "test" } }
]
`;
    fs.writeFileSync(keybindsFile, content);

    const keybinds = service.loadKeybinds();
    expect(keybinds).toEqual([
      { key: "F1", action: { type: "send_message", message: "test" } },
    ]);
  });

  test("loadKeybinds filters out invalid keybinds", () => {
    const keybindsFile = path.join(tempDir, "keybinds.jsonc");
    const content = `
[
  { "key": "F1", "action": { "type": "send_message", "message": "valid" } },
  { "key": "F2" },
  { "action": { "type": "send_message", "message": "no key" } },
  { "key": "F3", "action": { "type": "unknown", "data": "invalid" } },
  { "key": "F4", "action": { "type": "send_message", "message": 123 } }
]
`;
    fs.writeFileSync(keybindsFile, content);

    const keybinds = service.loadKeybinds();
    expect(keybinds).toEqual([
      { key: "F1", action: { type: "send_message", message: "valid" } },
    ]);
  });

  test("loadKeybinds handles malformed JSON gracefully", () => {
    const keybindsFile = path.join(tempDir, "keybinds.jsonc");
    fs.writeFileSync(keybindsFile, "not valid json {{{");

    const keybinds = service.loadKeybinds();
    expect(keybinds).toEqual([]);
  });

  test("saveKeybinds overwrites existing file", () => {
    const first: KeybindsConfig = [
      { key: "F1", action: { type: "send_message", message: "first" } },
    ];
    const second: KeybindsConfig = [
      { key: "F2", action: { type: "send_message", message: "second" } },
    ];

    service.saveKeybinds(first);
    service.saveKeybinds(second);

    const loaded = service.loadKeybinds();
    expect(loaded).toEqual(second);
  });

  test("saveKeybinds handles empty array", () => {
    service.saveKeybinds([]);

    const keybindsFile = path.join(tempDir, "keybinds.jsonc");
    expect(fs.existsSync(keybindsFile)).toBe(true);

    const loaded = service.loadKeybinds();
    expect(loaded).toEqual([]);
  });
});

