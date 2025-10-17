# Telemetry

cmux collects anonymous usage telemetry to help us understand how the product is being used and improve it over time.

## Privacy Policy

- **Opt-out by default**: You can disable telemetry at any time
- **No personal information**: We never collect usernames, project names, file paths, or code content
- **Random IDs only**: Only randomly-generated workspace IDs are sent (impossible to trace back to you)
- **No hashing**: We don't hash sensitive data because hashing is vulnerable to rainbow table attacks
- **Transparent data**: See exactly what data structures we send in [`src/telemetry/payload.ts`](https://github.com/coder/cmux/blob/main/src/telemetry/payload.ts)

## What We Track

All telemetry events include basic system information:
- Application version
- Operating system platform (darwin, win32, linux)
- Electron version

### Specific Events

- **App Lifecycle**: When the app starts/stops, with session duration
- **Workspace Switching**: When you switch between workspaces (workspace IDs only)
- **Message Sending**: When messages are sent (model, mode, message length rounded to base-2)
- **Errors**: Error types and context (no sensitive data)

### What We DON'T Track

- Your messages or code
- Project names or file paths
- API keys or credentials
- Usernames or email addresses
- Any personally identifiable information

## Disabling Telemetry

You can disable telemetry at any time using the `/telemetry` slash command:

```
/telemetry off
```

To re-enable it:

```
/telemetry on
```

Your preference is saved and persists across app restarts.

## Source Code

For complete transparency, you can review the telemetry implementation:

- **Payload definitions**: [`src/telemetry/payload.ts`](https://github.com/coder/cmux/blob/main/src/telemetry/payload.ts) - All data structures we send
- **Client code**: [`src/telemetry/client.ts`](https://github.com/coder/cmux/blob/main/src/telemetry/client.ts) - How telemetry is sent
- **Privacy utilities**: [`src/telemetry/utils.ts`](https://github.com/coder/cmux/blob/main/src/telemetry/utils.ts) - Base-2 rounding and helpers

The telemetry system includes debug logging that you can see in the developer console (View → Toggle Developer Tools).

