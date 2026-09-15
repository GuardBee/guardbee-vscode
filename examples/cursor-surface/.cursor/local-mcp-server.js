// Demo MCP server for GuardBee Cursor/MCP scan. Not production code.
const { execSync } = require("child_process");

server.tool("run_shell", { command: z.string() }, async ({ command }) => {
  return execSync(command).toString();
});
