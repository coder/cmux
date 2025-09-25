# Claude Code Headless JSON Streaming Reference

This guide explains how to drive Claude Code without the interactive TUI by streaming JSON over stdin/stdout. It consolidates the official headless, SDK, and streaming specifications so you can render your own UI or automate workflows around a Claude Code instance.

## Launching Claude Code Headlessly

- Install the CLI (`npm install -g @anthropic-ai/claude-code`) and invoke `claude -p` (print mode) to disable the interactive shell.[headless-mode]
- Use `--output-format` to pick the payload shape: `text`, `json`, or `stream-json`. `stream-json` is required for incremental updates.[headless-mode][cli-reference]
- Combine `--allowedTools` / `--disallowedTools`, `--permission-mode`, `--permission-prompt-tool`, and `--mcp-config` to control tool access in unattended environments.[headless-mode]
- Resume long-lived sessions with `--resume <session_id>` or `--continue` to pick up the most recent transcript in the working directory.[headless-mode][cli-reference]

Example launch command:

```sh
claude -p "Summarize the latest logs" \
  --output-format stream-json \
  --include-partial-messages \
  --allowedTools "Read,Grep" \
  --permission-mode acceptEdits
```

## Output Formats at a Glance

| Format | Transport | When to use |
| --- | --- | --- |
| `text` | Single UTF-8 blob | Quick CLI invocations where you only need the final answer. |
| `json` | Single JSON object | Batch scripts that parse the final result plus cost/usage metadata.[headless-mode] |
| `stream-json` | JSON Lines (one object per line) | Custom UIs and automations that need turn-by-turn events.[headless-mode] |

## Streaming JSON Output

### Transport Basics

- `stream-json` mode emits newline-delimited JSON objects on stdout. Each object includes a top-level `type` discriminator so you can dispatch on message kind.[headless-mode]
- The stream always starts with a `system` message (subtype `init`) describing the session, then mirrors every turn (`user`, `assistant`, tool events) before ending with a `result` summary.[headless-mode][sdk-typescript]
- Optional partial updates appear as `stream_event` objects when `--include-partial-messages` is set. These wrap the Anthropic Messages API SSE events.[headless-mode][sdk-typescript][streaming-guide]

### Event Lifecycle

1. `system:init` — session metadata (model, cwd, connected tools, permission mode).[sdk-typescript]
2. Zero or more echoed `user` messages for your prompts (including stdin batches).[sdk-typescript]
3. Repeating assistant/tool turns:
   - `assistant` for each full assistant message.
   - `stream_event` deltas (optional) carrying SSE events such as `content_block_delta`, `message_delta`, or `message_stop`.[sdk-typescript][streaming-guide]
   - `system:compact_boundary` whenever the agent compacts history.[sdk-typescript]
4. `result` — final status (`subtype` success or error), usage metrics, total cost, and any permission denials.[sdk-typescript]

A minimal response sequence:

```jsonl
{"type":"system","subtype":"init","session_id":"550e8400-e29b-41d4-a716-446655440000","model":"claude-sonnet-4-20250514"}
{"type":"user","session_id":"550e8400-e29b-41d4-a716-446655440000","message":{"role":"user","content":[{"type":"text","text":"Summarize server.log"}]}}
{"type":"assistant","session_id":"550e8400-e29b-41d4-a716-446655440000","message":{"role":"assistant","content":[{"type":"text","text":"Here is the summary..."}]}}
{"type":"result","subtype":"success","session_id":"550e8400-e29b-41d4-a716-446655440000","duration_ms":1275,"usage":{"input_tokens":912,"output_tokens":226},"total_cost_usd":0.0036}
```

### Message Schemas

| `type` | Key fields | Notes |
| --- | --- | --- |
| `system` (subtype `init`) | `session_id`, `uuid`, `model`, `cwd`, `tools[]`, `mcp_servers[]`, `permissionMode`, `slash_commands[]` | Use to seed UI metadata (model badge, connected tools).[sdk-typescript] |
| `system` (subtype `compact_boundary`) | `compact_metadata.pre_tokens`, `compact_metadata.trigger` | Signals that Claude trimmed earlier turns; refresh any cached transcript.[sdk-typescript] |
| `user` | `message.role`, `message.content[]`, `parent_tool_use_id` | `message` mirrors Anthropic Messages API user objects (text blocks, images, attachments).[sdk-typescript][messages-api] |
| `assistant` | `message.role`, `message.content[]`, `parent_tool_use_id` | Content blocks include `text`, `tool_use`, `tool_result`, and optional `thinking` segments when extended reasoning is enabled.[sdk-typescript][messages-api] |
| `stream_event` | `event.type`, `event.delta`, `parent_tool_use_id` | Wrapper for SSE events like `content_block_delta` or `message_stop`. Accumulate deltas per `index` to build live output.[sdk-typescript][streaming-guide] |
| `result` | `subtype`, `duration_ms`, `duration_api_ms`, `usage`, `num_turns`, `total_cost_usd`, `permission_denials[]` | Final accounting. `subtype` surfaces terminal errors (`error_max_turns`, `error_during_execution`).[sdk-typescript] |

The `message` payloads adopt the Anthropic Messages schema: each `content` array entry is a block with a `type` (`text`, `image`, `tool_use`, `tool_result`, `thinking`, etc.) and block-specific fields.[messages-api]

### Handling Partial Stream Events

When `--include-partial-messages` is enabled, parse `stream_event.event` according to the SSE contract:[streaming-guide]

- `content_block_delta` with `delta.type` `text_delta` — append incremental text.
- `content_block_delta` with `delta.type` `input_json_delta` — accumulate JSON fragments for tool inputs until the matching `content_block_stop` arrives, then parse.
- `message_delta` — update high-level metadata such as token usage mid-flight (values are cumulative).
- `message_stop` — marks the end of the assistant turn; expect the next top-level `assistant` or `result` object.
- `ping` and future event types — ignore or log; the SDK may add new kinds, so keep handlers forward-compatible.

## Streaming JSON Input

Claude Code can consume JSON Lines on stdin to drive multi-turn conversations without restarting the process:[headless-mode]

```sh
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Generate a changelog"}]}}' |
  claude -p --output-format stream-json --input-format stream-json --verbose
```

Guidelines:

- Every line must be a complete user message object with `type: "user"` and a `message` block that matches the Anthropic schema.[headless-mode][messages-api]
- Combine with `--resume <session_id>` or the SDK `continue` option to maintain context across invocations.[headless-mode][streaming-input-guide]
- The TypeScript/Python SDKs expose `query({ prompt: AsyncIterable<SDKUserMessage> })` to emit the same objects programmatically.[sdk-typescript][streaming-input-guide]

## Conversation & Permission Control

- Switch permission modes (`default`, `acceptEdits`, `bypassPermissions`, `plan`) dynamically via CLI or `query().setPermissionMode()`.[headless-mode][sdk-typescript]
- Watch for `permission_denials[]` inside the final `result` message to surface actionable prompts to users.[sdk-typescript]
- Hooks and MCP integrations remain available headlessly; load them with `--mcp-config` or the SDK `mcpServers` option.[headless-mode][sdk-typescript]

## Best Practices

- Parse JSON streams incrementally; avoid buffering the entire stdout to keep latency low.[headless-mode]
- Treat unknown message `type`/`subtype` or `stream_event.event.type` values as non-fatal to stay compatible with future releases.[streaming-guide]
- Respect rate limits by adding backoff between automated invocations and setting CLI timeouts (`timeout 300 claude ...`) for long tasks.[headless-mode]
- Log stderr separately; Claude Code emits diagnostic output (including MCP warnings) there even in print mode.[headless-mode]
- For billing or analytics, read `usage.input_tokens`, `usage.output_tokens`, and `total_cost_usd` from the terminal `result` message.[sdk-typescript]

## Reference Links

- [Claude Code headless mode][headless-mode]
- [Claude Code CLI reference][cli-reference]
- [Claude Code SDK TypeScript reference][sdk-typescript]
- [Streaming input vs single message guide][streaming-input-guide]
- [Anthropic streaming event specification][streaming-guide]
- [Anthropic Messages API schema][messages-api]

[headless-mode]: https://docs.claude.com/en/docs/claude-code/sdk/sdk-headless
[cli-reference]: https://docs.claude.com/en/docs/claude-code/cli-reference
[sdk-typescript]: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript
[streaming-input-guide]: https://docs.claude.com/en/docs/claude-code/sdk/streaming-vs-single-mode
[streaming-guide]: https://docs.claude.com/en/docs/build-with-claude/streaming
[messages-api]: https://docs.claude.com/en/api/messages
