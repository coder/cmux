import { parseRuntimeString } from "./chatCommands";

describe("parseRuntimeString", () => {
  const workspaceName = "test-workspace";

  test("returns undefined for undefined runtime (default to local)", () => {
    expect(parseRuntimeString(undefined, workspaceName)).toBeUndefined();
  });

  test("returns undefined for explicit 'local' runtime", () => {
    expect(parseRuntimeString("local", workspaceName)).toBeUndefined();
    expect(parseRuntimeString("LOCAL", workspaceName)).toBeUndefined();
    expect(parseRuntimeString(" local ", workspaceName)).toBeUndefined();
  });

  test("parses valid SSH runtime", () => {
    const result = parseRuntimeString("ssh user@host", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "user@host",
      srcBaseDir: "/home/cmux",
    });
  });

  test("preserves case in SSH host", () => {
    const result = parseRuntimeString("ssh User@Host.Example.Com", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "User@Host.Example.Com",
      srcBaseDir: "/home/cmux",
    });
  });

  test("handles extra whitespace", () => {
    const result = parseRuntimeString("  ssh   user@host  ", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "user@host",
      srcBaseDir: "/home/cmux",
    });
  });

  test("throws error for SSH without host", () => {
    expect(() => parseRuntimeString("ssh", workspaceName)).toThrow("SSH runtime requires host");
    expect(() => parseRuntimeString("ssh ", workspaceName)).toThrow("SSH runtime requires host");
  });

  test("accepts SSH with hostname only (user will be inferred)", () => {
    const result = parseRuntimeString("ssh hostname", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "hostname",
      srcBaseDir: "/home/cmux",
    });
  });

  test("accepts SSH with hostname.domain only", () => {
    const result = parseRuntimeString("ssh dev.example.com", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "dev.example.com",
      srcBaseDir: "/home/cmux",
    });
  });

  test("throws error for unknown runtime type", () => {
    expect(() => parseRuntimeString("docker", workspaceName)).toThrow(
      "Unknown runtime type: 'docker'"
    );
    expect(() => parseRuntimeString("remote", workspaceName)).toThrow(
      "Unknown runtime type: 'remote'"
    );
  });
});
