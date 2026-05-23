// Tools: ping_broker, ping_data, version.

import { z } from "zod";
import { EmptyArgsSchema } from "../schema.js";
import { adapterNames, getBroker, getData } from "../adapters.js";
import type { ToolDef } from "./types.js";

const SERVER_VERSION = "0.1.0";

export const healthTools: ToolDef[] = [
  {
    name: "ping_broker",
    description: "Check broker connectivity; returns latencyMs on success.",
    inputSchema: EmptyArgsSchema,
    inputJsonSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args: z.infer<typeof EmptyArgsSchema>) => {
      const broker = await getBroker();
      return await broker.ping();
    },
  },
  {
    name: "ping_data",
    description: "Check market-data connectivity; returns latencyMs on success.",
    inputSchema: EmptyArgsSchema,
    inputJsonSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args: z.infer<typeof EmptyArgsSchema>) => {
      const data = await getData();
      return await data.ping();
    },
  },
  {
    name: "version",
    description: "Report the MCP server version and active broker / data adapter names.",
    inputSchema: EmptyArgsSchema,
    inputJsonSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args: z.infer<typeof EmptyArgsSchema>) => {
      const adapters = adapterNames();
      return {
        server: "@financial-planner/mcp-server",
        version: SERVER_VERSION,
        broker: adapters.broker,
        data: adapters.data,
        killSwitch: process.env["MCP_KILL"] === "1",
        riskCeilingPct: parseFloat(process.env["MCP_RISK_CEILING_PCT"] ?? "0.01"),
      };
    },
  },
];
