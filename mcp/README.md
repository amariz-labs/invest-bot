# `@financial-planner/mcp-server`

An [MCP](https://modelcontextprotocol.io) server that exposes this repo's
`BrokerAdapter` and `DataAdapter` contracts as tools, so any MCP client
(Claude Desktop, Cursor, Codex, Gemini CLI, claude.ai desktop) can route
trading + market-data calls through the same adapter layer used by the
dashboard and the TradingView webhook receiver.

Built from the official `@modelcontextprotocol/sdk` — no vendor SDK is
imported at startup; everything is lazy-loaded by the adapter factory in
[`src/adapters.ts`](./src/adapters.ts).

## What's exposed

| Group | Tools |
|---|---|
| Account | `get_account` |
| Positions | `get_positions`, `get_position` |
| Orders | `place_order`, `cancel_order`, `replace_order`, `get_orders` |
| Quotes / bars | `get_quote`, `get_bars` |
| Symbols | `get_symbol`, `search_symbols` |
| Options | `get_options_chain` |
| Health | `ping_broker`, `ping_data`, `version` |

`place_order` runs the same hardening checklist as the TradingView webhook
receiver (see [`design/TRADINGVIEW-INTEGRATION.md` §5](../design/TRADINGVIEW-INTEGRATION.md)):
kill switch → tilt-guard state → PDT → buying power → per-trade risk
ceiling → idempotency → audit log.

**Not exposed:** `streamOrders` and `streamQuotes`. Push semantics over MCP
need server-initiated notifications / long-poll subscriptions that are out of
scope for the first cut; subscribe in-process or via the broker's own WS.

## Install & build

```bash
cd mcp
npm install
npm run build
```

## Run

Stdio (default — what every MCP client expects):

```bash
npm start
```

HTTP/SSE (useful for remote agents, dashboards, smoke tests):

```bash
npm start -- --transport http --port 7711
# GET  http://localhost:7711/sse      → opens an SSE stream
# POST http://localhost:7711/messages?sessionId=... → submit JSON-RPC messages
# GET  http://localhost:7711/healthz  → liveness probe
```

## Configure (the env vars that matter)

| Var | Default | Effect |
|---|---|---|
| `BROKER` | `synthetic` | `synthetic` / `alpaca` / `ibkr` / `tradier` |
| `DATA_REALTIME` | `synthetic` | `synthetic` / `polygon` / `yfinance` / `twelvedata` |
| `DATA_HISTORICAL` | (= `DATA_REALTIME`) | same set |
| `MCP_RISK_CEILING_PCT` | `0.01` | Max per-trade risk as fraction of equity. |
| `MCP_KILL` | unset | `1` makes every tool return `KILL_SWITCH` error. |
| `MCP_REPO_ROOT` | auto | Override for `data/state.yaml` + `data/mcp-log/` location. |
| Broker creds | — | See broker-specific section below. |

### Broker credentials

- **Alpaca**: `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `ALPACA_MODE=paper|live`.
- **IBKR**: `IBKR_HOST` (default `127.0.0.1`), `IBKR_PORT` (`7497` paper / `7496` live), `IBKR_CLIENT_ID`, `IBKR_MODE=paper|live`.
- **Tradier**: `TRADIER_TOKEN`, `TRADIER_ACCOUNT`, `TRADIER_MODE=paper|live`.
- **Polygon**: `POLYGON_KEY`.
- **Twelve Data**: `TWELVEDATA_KEY`.
- **yfinance**: `YFINANCE_BRIDGE_URL` (points at the Next.js `/api/yfinance` route).

## Wire into an MCP client

### Claude Desktop (`claude_desktop_config.json`)

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "financial-planner": {
      "command": "node",
      "args": ["/abs/path/to/Financial-Planner/mcp/dist/server.js"],
      "env": {
        "BROKER": "synthetic",
        "DATA_REALTIME": "synthetic",
        "MCP_RISK_CEILING_PCT": "0.01"
      }
    }
  }
}
```

### Cursor

Cursor reads MCP servers from `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` (per-project). The schema mirrors Claude Desktop:

```json
{
  "mcpServers": {
    "financial-planner": {
      "command": "node",
      "args": ["/abs/path/to/Financial-Planner/mcp/dist/server.js"],
      "env": { "BROKER": "synthetic", "DATA_REALTIME": "synthetic" }
    }
  }
}
```

See the Cursor docs for the canonical MCP setup page.

### Codex CLI

Codex reads MCP servers from its TOML config (`~/.codex/config.toml`):

```toml
[mcp_servers.financial-planner]
command = "node"
args = ["/abs/path/to/Financial-Planner/mcp/dist/server.js"]
env = { BROKER = "synthetic", DATA_REALTIME = "synthetic" }
```

### Gemini CLI

Gemini CLI consumes MCP servers from `~/.gemini/settings.json` under the
`mcpServers` key — same shape as Claude Desktop. Confirm against the
current docs for your CLI version.

### Any other MCP client

The wire protocol is standard JSON-RPC over stdio (or SSE in `--transport http`
mode). Anything that speaks MCP can connect; you just need to point it at
`node /abs/path/to/dist/server.js`.

## Safety model

### Pre-trade gates (run inside `place_order`)

1. **Kill switch** — `MCP_KILL=1` → all tools return `KILL_SWITCH`.
2. **Tilt-guard** — reads `data/state.yaml`. If `status == BLOCKED` or
   `trade_today == false`, throws `TRADE_BLOCKED`.
3. **PDT** — `patternDayTrader && daytradesRemaining <= 0` → `PDT_EXCEEDED`.
4. **Buying power** — `qty * estPrice > buyingPower` → `INSUFFICIENT_BUYING_POWER`.
5. **Risk ceiling** — `stopDistance * qty > equity * MCP_RISK_CEILING_PCT`
   → `RISK_CEILING_EXCEEDED`.
6. **Idempotency** — `(symbol, side, qty, minute_bucket)` LRU with 60s TTL
   → `DUPLICATE_ORDER`.
7. **Audit log** — every pass + fail decision is appended to
   `data/mcp-log/YYYY-MM-DD.jsonl` (atomic, fail-safe).

### Kill-switch drill

```bash
MCP_KILL=1 npm start
# every tool call now returns: [KILL_SWITCH] MCP_KILL=1 — all tool calls are disabled.
```

## Logging

- **Stderr** — one line per tool invocation: `[mcp] <tool> <ok|error> <ms>ms`.
- **Audit log** — `data/mcp-log/YYYY-MM-DD.jsonl`. One JSON object per call
  with `ts`, `tool`, `ms`, `ok`, optional `error`. Trade decisions include
  `decision`, `symbol`, `side`, `qty`.

## Folder layout

```
mcp/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── server.ts          # entrypoint; transport + tool dispatch
    ├── adapters.ts        # BROKER / DATA_REALTIME env -> concrete adapters (lazy)
    ├── gates.ts           # pre-trade gates + kill switch + audit log
    ├── schema.ts          # Zod schemas for every tool's args
    └── tools/
        ├── account.ts     # get_account
        ├── positions.ts   # get_positions, get_position
        ├── orders.ts      # place_order, cancel_order, replace_order, get_orders
        ├── quotes.ts      # get_quote, get_bars
        ├── symbols.ts     # get_symbol, search_symbols
        ├── options.ts     # get_options_chain
        ├── health.ts      # ping_broker, ping_data, version
        └── types.ts       # shared ToolDef interface
```

## Going live

Before flipping to a live broker:

1. Pick the broker (`BROKER=alpaca|ibkr|tradier`) and provide credentials.
2. **Validate in paper for at least a week.** Alpaca / IBKR / Tradier all
   have first-class paper accounts.
3. Set `MCP_RISK_CEILING_PCT` appropriately for your account size.
4. Run `/tilt-guard init` (in this repo) to scaffold `data/state.yaml` and
   the tilt rules — otherwise the gate is a no-op.
5. Test the kill switch (`MCP_KILL=1`) end-to-end so you know how to stop
   the server fast.
