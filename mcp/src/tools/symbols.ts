// Tools: get_symbol, search_symbols.

import { z } from "zod";
import { SearchSymbolsArgsSchema, SymbolArgsSchema } from "../schema.js";
import { getData } from "../adapters.js";
import type { ToolDef } from "./types.js";

export const symbolsTools: ToolDef[] = [
  {
    name: "get_symbol",
    description: "Get symbol metadata (exchange, session, tick size, marginable/shortable flags).",
    inputSchema: SymbolArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof SymbolArgsSchema>) => {
      const data = await getData();
      return await data.getSymbol(args.symbol);
    },
  },
  {
    name: "search_symbols",
    description: "Search for symbols by free-text query (name or ticker fragment).",
    inputSchema: SearchSymbolsArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
        type: { type: "string", enum: ["stock", "etf", "index", "futures", "forex", "crypto", "option"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof SearchSymbolsArgsSchema>) => {
      const data = await getData();
      const opts: { type?: "stock" | "etf" | "index" | "futures" | "forex" | "crypto" | "option"; limit?: number } = {};
      if (args.type) opts.type = args.type;
      if (args.limit) opts.limit = args.limit;
      return await data.search(args.query, opts);
    },
  },
];
