/**
 * Fish-style path abbreviation utility
 * Abbreviates all directory components except the last one to their first letter
 * Example: /Users/ammar/Projects/coder/cmux -> /U/a/P/c/cmux
 */
export function abbreviatePath(path: string): string {
  if (!path || typeof path !== "string") {
    return path;
  }

  const parts = path.split("/");

  // Handle root path or empty parts
  if (parts.length <= 1) {
    return path;
  }

  // Abbreviate all parts except the last one
  const abbreviated = parts.map((part, index) => {
    // Keep the last part full
    if (index === parts.length - 1) {
      return part;
    }
    // Keep empty parts (like leading slash)
    if (part === "") {
      return part;
    }
    // Abbreviate to first character
    return part[0];
  });

  return abbreviated.join("/");
}
