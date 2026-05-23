// Shared tool-def type for the registry in server.ts.

import type { ZodTypeAny } from "zod";

export interface ToolDef {
  /** snake_case, used as the MCP tool name. */
  name: string;
  /** One-sentence verb-first description (matches Anthropic skills convention). */
  description: string;
  /** Zod schema for runtime validation of args. */
  inputSchema: ZodTypeAny;
  /**
   * JSON Schema returned by tools/list. Hand-written to keep client-side
   * forms / discovery accurate; Zod-to-JSON-schema would also work but adds
   * a dependency for this single use.
   */
  inputJsonSchema: Record<string, unknown>;
  /** Async handler. Args are already validated by inputSchema. */
  handler: (args: unknown) => Promise<unknown>;
}
