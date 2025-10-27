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
      srcBaseDir: "/home/user/cmux",
    });
  });

  test("preserves case in SSH host", () => {
    const result = parseRuntimeString("ssh User@Host.Example.Com", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "User@Host.Example.Com",
      srcBaseDir: "/home/User/cmux",
    });
  });

  test("handles extra whitespace", () => {
    const result = parseRuntimeString("  ssh   user@host  ", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "user@host",
      srcBaseDir: "/home/user/cmux",
    });
  });

  test("throws error for SSH without host", () => {
    expect(() => parseRuntimeString("ssh", workspaceName)).toThrow("SSH runtime requires host");
    expect(() => parseRuntimeString("ssh ", workspaceName)).toThrow("SSH runtime requires host");
  });

  test("accepts SSH with hostname only (user will be inferred)", () => {
    const result = parseRuntimeString("ssh hostname", workspaceName);
    // When no user is specified, uses current user (process.env.USER)
    const expectedUser = process.env.USER ?? "user";
    const expectedHomeDir = expectedUser === "root" ? "/root" : `/home/${expectedUser}`;
    expect(result).toEqual({
      type: "ssh",
      host: "hostname",
      srcBaseDir: `${expectedHomeDir}/cmux`,
    });
  });

  test("accepts SSH with hostname.domain only", () => {
    const result = parseRuntimeString("ssh dev.example.com", workspaceName);
    // When no user is specified, uses current user (process.env.USER)
    const expectedUser = process.env.USER ?? "user";
    const expectedHomeDir = expectedUser === "root" ? "/root" : `/home/${expectedUser}`;
    expect(result).toEqual({
      type: "ssh",
      host: "dev.example.com",
      srcBaseDir: `${expectedHomeDir}/cmux`,
    });
  });

  test("uses /root for root user", () => {
    const result = parseRuntimeString("ssh root@hostname", workspaceName);
    expect(result).toEqual({
      type: "ssh",
      host: "root@hostname",
      srcBaseDir: "/root/cmux",
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
