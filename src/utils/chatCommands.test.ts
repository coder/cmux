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
      workdir: "~/cmux/test-workspace",
    });
  });

  test("preserves case in SSH host", () => {
    const result = parseRuntimeString("ssh User@Host.Example.Com", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "User@Host.Example.Com",
      workdir: "~/cmux/test-workspace",
    });
  });

  test("handles extra whitespace", () => {
    const result = parseRuntimeString("  ssh   user@host  ", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "user@host",
      workdir: "~/cmux/test-workspace",
    });
  });

  test("throws error for SSH without host", () => {
    expect(() => parseRuntimeString("ssh", workspaceName)).toThrow(
      "SSH runtime requires host"
    );
    expect(() => parseRuntimeString("ssh ", workspaceName)).toThrow(
      "SSH runtime requires host"
    );
  });

  test("throws error for SSH without user", () => {
    expect(() => parseRuntimeString("ssh hostname", workspaceName)).toThrow(
      "SSH host must include user"
    );
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
