## Models

See also:

- [System Prompt](./system-prompt.md)

cmux supports multiple AI providers through its flexible provider architecture.

### Supported Providers

#### Anthropic (Cloud)

Best supported provider with full feature support:

- `anthropic:claude-sonnet-4-5`
- `anthropic:claude-opus-4-1`

#### OpenAI (Cloud)

GPT-5 family of models:

- `openai:gpt-5`
- `openai:gpt-5-pro`
- `openai:gpt-5-codex`

**Note:** Anthropic models are better supported than GPT-5 class models due to an outstanding issue in the Vercel AI SDK.

TODO: add issue link here.

#### Ollama (Local)

Run models locally with Ollama. No API key required:

- `ollama:llama3.2:7b`
- `ollama:llama3.2:13b`
- `ollama:codellama:7b`
- `ollama:qwen2.5:7b`
- Any model from the [Ollama Library](https://ollama.com/library)

**Setup:**

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2:7b`
3. Configure in `~/.cmux/providers.jsonc`:

```jsonc
{
  "ollama": {
    // Default configuration - Ollama runs on localhost:11434
    "baseUrl": "http://localhost:11434",
  },
}
```

For remote Ollama instances, update `baseUrl` to point to your server.

### Provider Configuration

All providers are configured in `~/.cmux/providers.jsonc`. See example configurations:

```jsonc
{
  "anthropic": {
    "apiKey": "sk-ant-...",
  },
  "openai": {
    "apiKey": "sk-...",
  },
  "ollama": {
    "baseUrl": "http://localhost:11434", // Default - only needed if different
  },
}
```

### Model Selection

Use the Command Palette (`Cmd+Shift+P`) to switch models:

1. Open Command Palette
2. Type "model"
3. Select "Change Model"
4. Choose from available models

Models are specified in the format: `provider:model-name`
