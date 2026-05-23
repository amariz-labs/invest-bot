// Tools: get_quote, get_bars.

import { z } from "zod";
import { GetBarsArgsSchema, SymbolArgsSchema } from "../schema.js";
import { getData } from "../adapters.js";
import type { ToolDef } from "./types.js";

export const quotesTools: ToolDef[] = [
  {
    name: "get_quote",
    description: "Get the current Level 1 quote (bid/ask/last) for a symbol.",
    inputSchema: SymbolArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof SymbolArgsSchema>) => {
      const data = await getData();
      return await data.getQuote(args.symbol);
    },
  },
  {
    name: "get_bars",
    description: "Fetch OHLCV bars for a symbol between two unix-second timestamps.",
    inputSchema: GetBarsArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        resolution: { type: "string", enum: ["1", "5", "15", "30", "60", "240", "D", "W", "M"] },
        from: { type: "integer", minimum: 0, description: "Unix timestamp in seconds." },
        to: { type: "integer", minimum: 0, description: "Unix timestamp in seconds." },
        extendedHours: { type: "boolean" },
      },
      required: ["symbol", "resolution", "from", "to"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof GetBarsArgsSchema>) => {
      const data = await getData();
      return await data.getBars(args);
    },
  },
];
