import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const moveLspRoot = path.join(repositoryRoot, '.tools', 'sui-pilot', 'mcp', 'move-lsp-mcp');
const serverEntryPoint = path.join(moveLspRoot, 'dist', 'index.js');
const fixturePath = path.join(
  repositoryRoot,
  'tests',
  'fixtures',
  'sui-pilot-diagnostics',
  'sources',
  'broken.move',
);

for (const requiredPath of [serverEntryPoint, fixturePath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Required validation file is missing: ${requiredPath}`);
  }
}

const clientModulePath = path.join(
  moveLspRoot,
  'node_modules',
  '@modelcontextprotocol',
  'sdk',
  'dist',
  'esm',
  'client',
  'index.js',
);
const transportModulePath = path.join(
  moveLspRoot,
  'node_modules',
  '@modelcontextprotocol',
  'sdk',
  'dist',
  'esm',
  'client',
  'stdio.js',
);

const { Client } = await import(pathToFileURL(clientModulePath));
const { StdioClientTransport } = await import(pathToFileURL(transportModulePath));

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry) => typeof entry[1] === 'string'),
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntryPoint],
  cwd: repositoryRoot,
  env: {
    ...inheritedEnvironment,
    MOVE_LSP_LOG_LEVEL: process.env.MOVE_LSP_LOG_LEVEL || 'error',
    MOVE_LSP_TIMEOUT_MS: '30000',
  },
  stderr: 'pipe',
});
const stderrLines = [];
transport.stderr?.on('data', (chunk) => stderrLines.push(chunk.toString()));

const client = new Client(
  { name: 'the-last-alibi-sui-pilot-validation', version: '1.0.0' },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  console.log(`MCP initialize: OK (pid ${transport.pid})`);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  if (!toolNames.includes('move_diagnostics')) {
    throw new Error(`move_diagnostics was not advertised. Tools: ${toolNames.join(', ')}`);
  }
  console.log(`MCP tools: ${toolNames.join(', ')}`);

  let response;
  let textContent;
  let result;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    response = await client.callTool({
      name: 'move_diagnostics',
      arguments: { filePath: fixturePath, scope: 'file' },
    });
    textContent = response.content.find((item) => item.type === 'text');
    if (!textContent || typeof textContent.text !== 'string') {
      throw new Error('move_diagnostics returned no text payload.');
    }
    result = JSON.parse(textContent.text);
    if (response.isError || !Array.isArray(result.diagnostics)) {
      throw new Error(`move_diagnostics failed: ${textContent.text}`);
    }
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      console.log(`Diagnostics ready after attempt ${attempt}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error(`Expected an error diagnostic for ${fixturePath}, received: ${textContent.text}`);
  }

  console.log(`Diagnostics workspace: ${result.workspaceRoot}`);
  console.log(`Diagnostics count: ${result.diagnostics.length}`);
  for (const diagnostic of result.diagnostics) {
    console.log(`${diagnostic.severity} ${diagnostic.range.startLine + 1}:${diagnostic.range.startCharacter + 1} ${diagnostic.message}`);
  }
} catch (error) {
  if (stderrLines.length > 0) {
    console.error(stderrLines.join('').trim());
  }
  throw error;
} finally {
  await client.close();
}
