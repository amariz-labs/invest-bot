// Tool: get_options_chain — prefers the BrokerAdapter's chain (broker-native
// pricing, OCC symbols), falls back to the DataAdapter when the broker doesn't
// expose options.

import { z } from "zod";
import { OptionsChainArgsSchema } from "../schema.js";
import { getBroker, getData } from "../adapters.js";
import type { ToolDef } from "./types.js";

export const optionsTools: ToolDef[] = [
  {
    name: "get_options_chain",
    description: "Fetch the options chain for an underlying, optionally filtered to one expiration (ISO date).",
    inputSchema: OptionsChainArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        underlying: { type: "string" },
        expiration: { type: "string", description: "ISO date YYYY-MM-DD" },
      },
      required: ["underlying"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof OptionsChainArgsSchema>) => {
      const broker = await getBroker();
      if (broker.getOptionsChain) {
        try {
          return await broker.getOptionsChain(args.underlying, args.expiration);
        } catch (err) {
          // Fall through to data adapter.
          process.stderr.write(
            `[mcp] broker.getOptionsChain failed, falling back to data adapter: ${(err as Error).message}\n`,
          );
        }
      }
      const data = await getData();
      if (!data.getOptionsChain) {
        throw new Error(
          `neither broker (${broker.name}) nor data adapter (${data.name}) exposes getOptionsChain`,
        );
      }
      return await data.getOptionsChain(args.underlying, args.expiration);
    },
  },
];
