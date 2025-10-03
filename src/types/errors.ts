/**
 * Strongly-typed error types for send message operations.
 * This discriminated union allows the frontend to handle different error cases appropriately.
 */

/**
 * Discriminated union for all possible sendMessage errors
 * The frontend is responsible for language and messaging for api_key_not_found and
 * provider_not_supported errors. Other error types include details needed for display.
 */
export type SendMessageError =
  | { type: "api_key_not_found"; provider: string }
  | { type: "provider_not_supported"; provider: string }
  | { type: "invalid_model_string"; message: string }
  | { type: "unknown"; raw: string };

/**
 * Type guard to check if error is an API key error
 */
export function isApiKeyError(
  error: SendMessageError
): error is { type: "api_key_not_found"; provider: string } {
  return error.type === "api_key_not_found";
}

/**
 * Type guard to check if error is an unknown error
 */
export function isUnknownError(error: SendMessageError): error is { type: "unknown"; raw: string } {
  return error.type === "unknown";
}
