import type { Runtime } from "./Runtime";
import { LocalRuntime } from "./LocalRuntime";
import { SSHRuntime } from "./SSHRuntime";
import type { RuntimeConfig } from "@/types/runtime";

/**
 * Create a Runtime instance based on the configuration
 */
export function createRuntime(config: RuntimeConfig): Runtime {
  switch (config.type) {
    case "local":
      return new LocalRuntime();

    case "ssh":
      return new SSHRuntime({
        host: config.host,
        user: config.user,
        port: config.port,
        keyPath: config.keyPath,
        password: config.password,
        workdir: config.workdir,
      });

    default:
      throw new Error(`Unknown runtime type: ${(config as any).type}`);
  }
}

