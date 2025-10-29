export const PORT_FLAG = "--port";

export type PortOptionResult =
  | { kind: "none" }
  | { kind: "ok"; port: number }
  | { kind: "error"; message: string };

const PORT_PREFIX = `${PORT_FLAG}=`;

export const parsePortOption = (values: string[]): PortOptionResult => {
  let portValue: string | undefined;

  for (let i = 1; i < values.length; i += 1) {
    const current = values[i];

    if (current === PORT_FLAG) {
      const next = values[i + 1];
      if (!next || next.startsWith("-")) {
        return {
          kind: "error",
          message: "Missing value for --port option. Provide a number, e.g. --port 3000.",
        };
      }
      portValue = next;
      break;
    }

    if (current.startsWith(PORT_PREFIX)) {
      portValue = current.slice(PORT_PREFIX.length);
      break;
    }
  }

  if (portValue === undefined) {
    return { kind: "none" };
  }

  const parsedPort = Number.parseInt(portValue, 10);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    return {
      kind: "error",
      message: `Invalid port "${portValue}". Use an integer between 1 and 65535.`,
    };
  }

  return { kind: "ok", port: parsedPort };
};
