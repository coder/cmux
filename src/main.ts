/**
 * The main CLI entrypoint for cmux.
 */

const isServer = process.argv.length > 2 && process.argv[2] === "server";

if (isServer) {
  require("./main-server");
} else {
  require("./main-desktop");
}
