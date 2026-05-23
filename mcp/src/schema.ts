// Zod schemas for MCP tool inputs. These mirror the BrokerAdapter and
// DataAdapter interfaces in design/code/{BrokerAdapter,DataAdapter}.ts.
// Keep these shapes EXACT — schema drift breaks every downstream consumer.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const SideSchema = z.enum(["buy", "sell"]);

export const OrderTypeSchema = z.enum([
  "market",
  "limit",
  "stop",
  "stop_limit",
  "trailing_stop",
]);

export const TimeInForceSchema = z.enum([
  "day",
  "gtc",
  "ioc",
  "fok",
  "opg",
  "cls",
]);

export const ResolutionSchema = z.enum([
  "1",
  "5",
  "15",
  "30",
  "60",
  "240",
  "D",
  "W",
  "M",
]);

export const SymbolTypeSchema = z.enum([
  "stock",
  "etf",
  "index",
  "futures",
  "forex",
  "crypto",
  "option",
]);

// Permissive but safe symbol pattern (matches the TV webhook receiver's regex).
const SymbolStringSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9.\-/:]+$/i, "symbol must be alphanumeric with . - / :");

// ISO date or ISO datetime (lightweight check; brokers do the strict parse).
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "expected ISO date (YYYY-MM-DD)");

// ---------------------------------------------------------------------------
// Composite shapes — matches BrokerAdapter.OrderRequest exactly.
// ---------------------------------------------------------------------------

export const OptionLegSchema = z.object({
  underlying: SymbolStringSchema,
  expiration: IsoDateSchema,
  strike: z.number().positive(),
  right: z.enum(["call", "put"]),
});

export const TakeProfitSchema = z.object({
  limitPrice: z.number().positive(),
});

export const StopLossSchema = z.object({
  stopPrice: z.number().positive(),
  limitPrice: z.number().positive().optional(),
});

export const OrderRequestSchema = z
  .object({
    symbol: SymbolStringSchema,
    side: SideSchema,
    type: OrderTypeSchema,
    qty: z.number().positive().max(1_000_000),
    limitPrice: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    trailPct: z.number().positive().max(100).optional(),
    trailAmount: z.number().positive().optional(),
    timeInForce: TimeInForceSchema.optional(),
    extendedHours: z.boolean().optional(),
    takeProfit: TakeProfitSchema.optional(),
    stopLoss: StopLossSchema.optional(),
    clientOrderId: z.string().min(1).max(128).optional(),
    linkedTo: z.string().min(1).max(128).optional(),
    option: OptionLegSchema.optional(),
  })
  .superRefine((req, ctx) => {
    // Order-type sanity: enforce the price fields each type requires.
    if (req.type === "limit" && req.limitPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "limit orders require limitPrice",
      });
    }
    if ((req.type === "stop" || req.type === "stop_limit") && req.stopPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stop / stop_limit orders require stopPrice",
      });
    }
    if (req.type === "stop_limit" && req.limitPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stop_limit orders require limitPrice",
      });
    }
    if (req.type === "trailing_stop" && req.trailPct === undefined && req.trailAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "trailing_stop orders require trailPct or trailAmount",
      });
    }
  });

// Partial<OrderRequest> for replace_order (no superRefine — partial patches
// can legitimately omit required fields).
export const OrderRequestPatchSchema = z
  .object({
    symbol: SymbolStringSchema.optional(),
    side: SideSchema.optional(),
    type: OrderTypeSchema.optional(),
    qty: z.number().positive().max(1_000_000).optional(),
    limitPrice: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    trailPct: z.number().positive().max(100).optional(),
    trailAmount: z.number().positive().optional(),
    timeInForce: TimeInForceSchema.optional(),
    extendedHours: z.boolean().optional(),
    takeProfit: TakeProfitSchema.optional(),
    stopLoss: StopLossSchema.optional(),
    clientOrderId: z.string().min(1).max(128).optional(),
    linkedTo: z.string().min(1).max(128).optional(),
    option: OptionLegSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tool input schemas
// ---------------------------------------------------------------------------

export const EmptyArgsSchema = z.object({}).strict();

export const SymbolArgsSchema = z
  .object({
    symbol: SymbolStringSchema,
  })
  .strict();

export const CancelOrderArgsSchema = z
  .object({
    orderId: z.string().min(1).max(128),
  })
  .strict();

export const ReplaceOrderArgsSchema = z
  .object({
    orderId: z.string().min(1).max(128),
    patch: OrderRequestPatchSchema,
  })
  .strict();

export const GetOrdersArgsSchema = z
  .object({
    status: z.enum(["open", "closed", "all"]).optional(),
    limit: z.number().int().positive().max(500).optional(),
  })
  .strict();

export const GetBarsArgsSchema = z
  .object({
    symbol: SymbolStringSchema,
    resolution: ResolutionSchema,
    from: z.number().int().nonnegative(), // unix seconds
    to: z.number().int().nonnegative(),
    extendedHours: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.to >= v.from, { message: "`to` must be >= `from`" });

export const SearchSymbolsArgsSchema = z
  .object({
    query: z.string().min(1).max(128),
    type: SymbolTypeSchema.optional(),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();

export const OptionsChainArgsSchema = z
  .object({
    underlying: SymbolStringSchema,
    expiration: IsoDateSchema.optional(),
  })
  .strict();

// Re-exports as TS types (used by tool handlers).
export type OrderRequestInput = z.infer<typeof OrderRequestSchema>;
export type OrderRequestPatchInput = z.infer<typeof OrderRequestPatchSchema>;
export type GetBarsInput = z.infer<typeof GetBarsArgsSchema>;
export type SearchSymbolsInput = z.infer<typeof SearchSymbolsArgsSchema>;
export type OptionsChainInput = z.infer<typeof OptionsChainArgsSchema>;
