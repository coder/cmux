import { readFile } from 'fs/promises';
import { join } from 'path';
import { StreamingMessageAggregator } from '../utils/StreamingMessageAggregator';
import { SESSIONS_DIR } from '../config';

export async function uiMessagesCommand(workspaceKey?: string, dropLast: number = 0) {
  if (!workspaceKey) {
    console.error('Error: --workspace required');
    process.exit(1);
  }

  try {
    // Load workspace data
    const workspaceFile = join(SESSIONS_DIR, workspaceKey, 'session.json');
    const data = JSON.parse(await readFile(workspaceFile, 'utf-8'));
    
    // Drop last N messages if requested
    const messagesToProcess = dropLast > 0 
      ? data.history.slice(0, -dropLast)
      : data.history;
    
    // Process through same aggregator as UI
    const aggregator = new StreamingMessageAggregator();
    
    messagesToProcess.forEach((sdkMsg: any) => {
      aggregator.processSDKMessage(sdkMsg);
    });
    
    const uiMessages = aggregator.getAllMessages();
    
    // Display clean summary
    console.log(`\nUI Messages for workspace: ${workspaceKey}`);
    console.log(`Total SDK messages: ${data.history.length}`);
    if (dropLast > 0) {
      console.log(`Processed SDK messages: ${messagesToProcess.length} (dropped last ${dropLast})`);
    }
    console.log(`Total UI messages: ${uiMessages.length}`);
    console.log('---\n');
    
    uiMessages.forEach((msg, i) => {
      const streamingInfo = msg.isStreaming ? ' [STREAMING]' : '';
      
      // Handle different content types
      let preview = '';
      if (typeof msg.content === 'string') {
        preview = msg.content.slice(0, 60).replace(/\n/g, '\\n');
        if (msg.content.length > 60) preview += '...';
      } else if (msg.type === 'tool_use') {
        preview = `${msg.metadata?.toolName || 'unknown'}: ${JSON.stringify(msg.metadata?.toolInput || {}).slice(0, 50)}...`;
      } else if (msg.type === 'tool_result') {
        const toolName = msg.associatedToolUse?.name || 'unknown';
        const isError = msg.toolResult?.is_error ? '[ERROR]' : '[SUCCESS]';
        const contentPreview = typeof msg.content === 'string' 
          ? msg.content.slice(0, 30).replace(/\n/g, '\\n') 
          : JSON.stringify(msg.content).slice(0, 30);
        preview = `${toolName} ${isError} (id: ${msg.toolUseId?.slice(0, 8) || 'none'}) -> ${contentPreview}...`;
      } else if (msg.content) {
        preview = JSON.stringify(msg.content).slice(0, 60) + '...';
      } else {
        preview = '(no content)';
      }
      
      console.log(`${i + 1}. [${msg.type}]${streamingInfo} ${preview}`);
    });
    
    console.log('\n');
  } catch (error) {
    console.error(`Error reading workspace ${workspaceKey}:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}