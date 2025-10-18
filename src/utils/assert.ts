export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) throw new Error(msg ?? "Assertion failed");
}
