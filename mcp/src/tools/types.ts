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
  /**
   * Async handler. Args are validated by `inputSchema` in server.ts BEFORE
   * the handler is called, so each tool can safely type its `args` to the
   * inferred Zod shape (`z.infer<typeof Schema>`). We use the broad
   * `unknown` here on the interface, but contravariance would reject any
   * narrower handler — so the field is typed as a function returning
   * `Promise<unknown>` with an opaque arg, and each handler casts inside.
   *
   * The interface field below uses `any` for the arg to allow tools to
   * pin a concrete inferred type at the definition site without TS2322
   * variance errors; the call site in server.ts already validates via
   * `inputSchema.safeParse` before dispatch.
   */
  // biome-ignore lint/suspicious/noExplicitAny: handler args are pre-validated by inputSchema in server.ts
  handler: (args: any) => Promise<unknown>;
}
