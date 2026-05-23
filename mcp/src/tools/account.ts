// Tool: get_account — return the current Account snapshot from the active
// BrokerAdapter.

import { z } from "zod";
import { EmptyArgsSchema } from "../schema.js";
import { getBroker } from "../adapters.js";
import type { ToolDef } from "./types.js";

export const accountTools: ToolDef[] = [
  {
    name: "get_account",
    description: "Get the current trading account snapshot (equity, cash, buying power, PDT status).",
    inputSchema: EmptyArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (_args: z.infer<typeof EmptyArgsSchema>) => {
      const broker = await getBroker();
      return await broker.getAccount();
    },
  },
];
