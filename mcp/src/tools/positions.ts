// Tools: get_positions, get_position.

import { z } from "zod";
import { EmptyArgsSchema, SymbolArgsSchema } from "../schema.js";
import { getBroker } from "../adapters.js";
import type { ToolDef } from "./types.js";

export const positionsTools: ToolDef[] = [
  {
    name: "get_positions",
    description: "List all open positions (signed qty, avg entry, market value, unrealized PnL).",
    inputSchema: EmptyArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (_args: z.infer<typeof EmptyArgsSchema>) => {
      const broker = await getBroker();
      return await broker.getPositions();
    },
  },
  {
    name: "get_position",
    description: "Get the open position for a single symbol; returns null when flat.",
    inputSchema: SymbolArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol (e.g. AAPL, SPY)." },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof SymbolArgsSchema>) => {
      const broker = await getBroker();
      return await broker.getPosition(args.symbol);
    },
  },
];
