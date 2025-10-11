import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Disposable test temp directory that auto-cleans when disposed
 * Use with `using` statement for automatic cleanup in tests
 */
export class TestTempDir implements Disposable {
  public readonly path: string;

  constructor(prefix = "test-tool") {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.path = path.join(os.tmpdir(), `${prefix}-${id}`);
    fs.mkdirSync(this.path, { recursive: true });
  }

  [Symbol.dispose](): void {
    if (fs.existsSync(this.path)) {
      try {
        fs.rmSync(this.path, { recursive: true, force: true });
      } catch (error) {
        console.error(`Failed to cleanup test temp dir ${this.path}:`, error);
      }
    }
  }
}
