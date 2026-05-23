#!/usr/bin/env node
// MCP server entrypoint. Exposes BrokerAdapter + DataAdapter contracts as
// MCP tools so external agents (Cursor, Claude Desktop, Codex, Gemini CLI)
// can route trading operations through this repo's adapter layer.
//
//   Build:  npm install && npm run build
//   Run:    npm start                       (stdio transport)
//           npm start -- --transport http --port 7711  (HTTP/SSE)
//
// All vendor SDKs (Alpaca, IBKR, Tradier, Polygon, ...) are lazy-imported by
// the adapter factory in ./adapters.ts, so a synthetic-mode server boots with
// zero third-party deps.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { accountTools } from "./tools/account.js";
import { positionsTools } from "./tools/positions.js";
import { ordersTools } from "./tools/orders.js";
import { quotesTools } from "./tools/quotes.js";
import { symbolsTools } from "./tools/symbols.js";
import { optionsTools } from "./tools/options.js";
import { healthTools } from "./tools/health.js";
import type { ToolDef } from "./tools/types.js";
import { GateError, assertNotKilled, auditTool } from "./gates.js";

const SERVER_NAME = "@financial-planner/mcp-server";
const SERVER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Tool registry — single source of truth.
// ---------------------------------------------------------------------------
const TOOLS: ToolDef[] = [
  ...accountTools,
  ...positionsTools,
  ...ordersTools,
  ...quotesTools,
  ...symbolsTools,
  ...optionsTools,
  ...healthTools,
];

const TOOL_INDEX = new Map(TOOLS.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------
// Build server + wire handlers.
// ---------------------------------------------------------------------------
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputJsonSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const tool = TOOL_INDEX.get(name);
  if (!tool) {
    throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
  }

  const started = Date.now();
  try {
    assertNotKilled(name);

    // Runtime arg validation via Zod.
    const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `invalid args for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
      );
    }

    const result = await tool.handler(parsed.data);
    const ms = Date.now() - started;
    process.stderr.write(`[mcp] ${name} ok ${ms}ms\n`);
    auditTool({ tool: name, ms, ok: true });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcp] ${name} error ${ms}ms: ${message}\n`);
    auditTool({ tool: name, ms, ok: false, error: message });

    if (err instanceof McpError) throw err;
    if (err instanceof GateError) {
      // Surface gate code in the error message — clients should pattern-match.
      throw new McpError(ErrorCode.InvalidRequest, `[${err.code}] ${err.message}`);
    }
    throw new McpError(ErrorCode.InternalError, message);
  }
});

// ---------------------------------------------------------------------------
// Transport selection.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const transportFlag = readFlag(argv, "--transport") ?? "stdio";

  if (transportFlag === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[mcp] ${SERVER_NAME} v${SERVER_VERSION} listening on stdio\n`);
    return;
  }

  if (transportFlag === "http") {
    // HTTP/SSE transport. Lazy-imported so stdio-only users don't pay the
    // cost of pulling in the SSE module.
    const portStr = readFlag(argv, "--port") ?? "7711";
    const port = Number(portStr);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`invalid --port: ${portStr}`);
    }
    const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
    const http = await import("node:http");

    // Map of session-id -> transport (SSE requires a long-lived response).
    const transports = new Map<string, InstanceType<typeof SSEServerTransport>>();
    const httpServer = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (req.method === "GET" && url.pathname === "/sse") {
          const transport = new SSEServerTransport("/messages", res);
          transports.set(transport.sessionId, transport);
          res.on("close", () => transports.delete(transport.sessionId));
          await server.connect(transport);
          return;
        }
        if (req.method === "POST" && url.pathname === "/messages") {
          const sessionId = url.searchParams.get("sessionId");
          if (!sessionId) {
            res.writeHead(400).end("missing sessionId");
            return;
          }
          const transport = transports.get(sessionId);
          if (!transport) {
            res.writeHead(404).end("session not found");
            return;
          }
          await transport.handlePostMessage(req, res);
          return;
        }
        if (req.method === "GET" && url.pathname === "/healthz") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, server: SERVER_NAME, version: SERVER_VERSION }));
          return;
        }
        res.writeHead(404).end("not found");
      } catch (err) {
        process.stderr.write(`[mcp] http error: ${(err as Error).message}\n`);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
    httpServer.listen(port, () => {
      process.stderr.write(
        `[mcp] ${SERVER_NAME} v${SERVER_VERSION} listening on http://localhost:${port} (SSE at /sse, POST /messages)\n`,
      );
    });
    return;
  }

  throw new Error(`unknown --transport: ${transportFlag} (expected: stdio | http)`);
}

function readFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

main().catch((err) => {
  process.stderr.write(`[mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
