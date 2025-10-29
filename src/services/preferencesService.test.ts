import { describe, it, expect, beforeEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Config } from "@/config";
import { PreferencesService } from "@/services/preferencesService";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types/notifications";

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmux-prefs-test-"));
  return dir;
}

describe("PreferencesService", () => {
  let root: string;
  let config: Config;

  beforeEach(() => {
    root = makeTempDir();
    config = new Config(root);
  });

  it("loads defaults when file missing", () => {
    const svc = new PreferencesService(config);
    const prefs = svc.load();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("saves and loads preferences", () => {
    const svc = new PreferencesService(config);
    const initial = svc.load();
    const next = {
      ...initial,
      enabled: true,
      kinds: { ...initial.kinds, question: false },
      onlyWhenUnfocused: false,
      includePreview: false,
    };
    svc.save(next);

    const reloaded = svc.load();
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.kinds.question).toBe(false);
    expect(reloaded.onlyWhenUnfocused).toBe(false);
    expect(reloaded.includePreview).toBe(false);
  });
});

