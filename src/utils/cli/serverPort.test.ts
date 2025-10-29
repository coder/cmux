import { parsePortOption } from "./serverPort";

describe("parsePortOption", () => {
  const withArgs = (...rest: string[]) => parsePortOption(["server", ...rest]);

  it("returns none when flag is absent", () => {
    expect(withArgs()).toEqual({ kind: "none" });
  });

  it("parses a port specified as a separate argument", () => {
    expect(withArgs("--port", "4500")).toEqual({ kind: "ok", port: 4500 });
  });

  it("parses a port specified with an equals sign", () => {
    expect(withArgs("--port=5500")).toEqual({ kind: "ok", port: 5500 });
  });

  it("returns an error when the flag is missing a value", () => {
    expect(withArgs("--port")).toEqual({
      kind: "error",
      message: "Missing value for --port option. Provide a number, e.g. --port 3000.",
    });
  });

  it("returns an error when the value is not an integer", () => {
    expect(withArgs("--port", "abc")).toEqual({
      kind: "error",
      message: 'Invalid port "abc". Use an integer between 1 and 65535.',
    });
  });

  it("returns an error when the value is out of range", () => {
    expect(withArgs("--port", "70000")).toEqual({
      kind: "error",
      message: 'Invalid port "70000". Use an integer between 1 and 65535.',
    });
  });
});
