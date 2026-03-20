import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  // Config is validated at startup — fails fast with a clear message
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // All diagnostic output goes to stderr — stdout is the MCP wire protocol
  console.error('[hudl-mcp] Server running on stdio');
  console.error(`[hudl-mcp] Team ID: ${config.teamId}`);
}

main().catch((err: unknown) => {
  console.error('[hudl-mcp] Fatal error:', err);
  process.exit(1);
});
