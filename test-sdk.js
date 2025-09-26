#!/usr/bin/env node

// Simple test to verify the Claude Code SDK works
const { query } = require("@anthropic-ai/claude-code/sdk");

async function test() {
  console.log("Testing Claude Code SDK...");

  try {
    const response = query({
      prompt: 'Say "Hello from Claude SDK" and nothing else',
      options: {
        cwd: process.cwd(),
        permissionMode: "default",
      },
    });

    console.log("Query created, streaming responses:");

    for await (const message of response) {
      console.log("Message:", JSON.stringify(message, null, 2));

      // Stop after first assistant message
      if (message.type === "assistant" || message.role === "assistant") {
        break;
      }
    }

    console.log("Test complete!");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

test();
