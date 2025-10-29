#!/usr/bin/env node

import { parsePortOption } from "./utils/cli/serverPort";

const args = process.argv.slice(2);
const isServer = process.argv.length > 2 && process.argv[2] === "server";

const run = (): void => {
  if (isServer) {
    const result = parsePortOption(args);

    if (result.kind === "error") {
      console.error(result.message);
      process.exit(1);
    }

    if (result.kind === "ok") {
      process.env.CMUX_SERVER_PORT = String(result.port);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./main-server");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-desktop");
};

if (typeof require !== "undefined" && require.main === module) {
  run();
}
