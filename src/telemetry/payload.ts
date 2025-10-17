/**
 * Telemetry Payload Definitions
 *
 * This file defines all data structures sent to PostHog for user transparency.
 * Users can inspect this file to understand exactly what telemetry data is collected.
 *
 * PRIVACY GUIDELINES:
 * - Randomly generated IDs (e.g., workspace IDs, session IDs) can be sent verbatim
 *   as they contain no user information and are not guessable.
 * - Display names, project names, file paths, or anything that could reveal the
 *   nature of the user's work MUST NOT be sent, even if hashed.
 *   Hashing is vulnerable to rainbow table attacks and brute-force, especially
 *   for common project names or predictable patterns.
 * - When in doubt, don't send it. Privacy is paramount.
 */

/**
 * Base properties included with all telemetry events
 */
export interface BaseTelemetryProperties {
  /** Application version */
  version: string;
  /** Operating system platform (darwin, win32, linux) */
  platform: string;
  /** Electron version */
  electronVersion: string;
}

/**
 * Application lifecycle events
 */
export interface AppStartedProperties extends BaseTelemetryProperties {
  /** Whether this is the first app launch */
  isFirstLaunch: boolean;
}

export interface AppClosedProperties extends BaseTelemetryProperties {
  /** Session duration in seconds */
  sessionDuration: number;
}

/**
 * Workspace events
 */
export interface WorkspaceCreatedProperties extends BaseTelemetryProperties {
  /** Workspace ID (randomly generated, safe to send) */
  workspaceId: string;
}

export interface WorkspaceSwitchedProperties extends BaseTelemetryProperties {
  /** Previous workspace ID (randomly generated, safe to send) */
  fromWorkspaceId: string;
  /** New workspace ID (randomly generated, safe to send) */
  toWorkspaceId: string;
}

/**
 * Chat/AI interaction events
 */
export interface MessageSentProperties extends BaseTelemetryProperties {
  /** Model provider (e.g., 'anthropic', 'openai') */
  provider: string;
  /** Model name (e.g., 'claude-3-5-sonnet-20241022') */
  model: string;
  /** Permission mode ('plan' or 'edit') */
  mode: "plan" | "edit";
  /** Approximate message length bucket (<100, 100-500, 500-1000, >1000) */
  messageLengthBucket: string;
}

/**
 * Error tracking events
 */
export interface ErrorOccurredProperties extends BaseTelemetryProperties {
  /** Error type/name */
  errorType: string;
  /** Error context (e.g., 'workspace-creation', 'message-send') */
  context: string;
}

/**
 * Union type of all telemetry event payloads
 */
export type TelemetryEventPayload =
  | { event: "app_started"; properties: AppStartedProperties }
  | { event: "app_closed"; properties: AppClosedProperties }
  | { event: "workspace_created"; properties: WorkspaceCreatedProperties }
  | { event: "workspace_switched"; properties: WorkspaceSwitchedProperties }
  | { event: "message_sent"; properties: MessageSentProperties }
  | { event: "error_occurred"; properties: ErrorOccurredProperties };
