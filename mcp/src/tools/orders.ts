// Tools: place_order, cancel_order, replace_order, get_orders.
//
// place_order runs the full pre-trade gate stack (tilt-guard, PDT, buying
// power, risk ceiling, idempotency) before calling the broker.

import { z } from "zod";
import {
  CancelOrderArgsSchema,
  GetOrdersArgsSchema,
  OrderRequestSchema,
  ReplaceOrderArgsSchema,
} from "../schema.js";
import { getBroker, getData } from "../adapters.js";
import { GateError, preTradeGate } from "../gates.js";
import type { ToolDef } from "./types.js";

export const ordersTools: ToolDef[] = [
  {
    name: "place_order",
    description:
      "Submit an order through the active broker. Runs pre-trade gates (tilt-guard, PDT, buying power, per-trade risk ceiling, idempotency) before routing.",
    inputSchema: OrderRequestSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        side: { type: "string", enum: ["buy", "sell"] },
        type: {
          type: "string",
          enum: ["market", "limit", "stop", "stop_limit", "trailing_stop"],
        },
        qty: { type: "number", exclusiveMinimum: 0 },
        limitPrice: { type: "number", exclusiveMinimum: 0 },
        stopPrice: { type: "number", exclusiveMinimum: 0 },
        trailPct: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        trailAmount: { type: "number", exclusiveMinimum: 0 },
        timeInForce: { type: "string", enum: ["day", "gtc", "ioc", "fok", "opg", "cls"] },
        extendedHours: { type: "boolean" },
        takeProfit: {
          type: "object",
          properties: { limitPrice: { type: "number", exclusiveMinimum: 0 } },
          required: ["limitPrice"],
          additionalProperties: false,
        },
        stopLoss: {
          type: "object",
          properties: {
            stopPrice: { type: "number", exclusiveMinimum: 0 },
            limitPrice: { type: "number", exclusiveMinimum: 0 },
          },
          required: ["stopPrice"],
          additionalProperties: false,
        },
        clientOrderId: { type: "string" },
        linkedTo: { type: "string" },
        option: {
          type: "object",
          properties: {
            underlying: { type: "string" },
            expiration: { type: "string", description: "ISO date YYYY-MM-DD" },
            strike: { type: "number", exclusiveMinimum: 0 },
            right: { type: "string", enum: ["call", "put"] },
          },
          required: ["underlying", "expiration", "strike", "right"],
          additionalProperties: false,
        },
      },
      required: ["symbol", "side", "type", "qty"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof OrderRequestSchema>) => {
      const broker = await getBroker();
      const account = await broker.getAccount();

      // Best-effort live price for buying-power + risk checks.
      let estPrice: number | undefined;
      try {
        const data = await getData();
        const q = await data.getQuote(args.symbol);
        estPrice = q.last;
      } catch {
        // fall back to limit / stop price from the request inside the gate
      }

      try {
        preTradeGate({ req: args, account, estPrice });
      } catch (err) {
        if (err instanceof GateError) throw err;
        throw err;
      }
      return await broker.placeOrder(args);
    },
  },
  {
    name: "cancel_order",
    description: "Cancel an open order by broker order id.",
    inputSchema: CancelOrderArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof CancelOrderArgsSchema>) => {
      const broker = await getBroker();
      await broker.cancelOrder(args.orderId);
      return { ok: true, orderId: args.orderId };
    },
  },
  {
    name: "replace_order",
    description: "Replace an existing open order with a patch (price, qty, TIF, etc.).",
    inputSchema: ReplaceOrderArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        patch: { type: "object", additionalProperties: true },
      },
      required: ["orderId", "patch"],
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof ReplaceOrderArgsSchema>) => {
      const broker = await getBroker();
      return await broker.replaceOrder(args.orderId, args.patch);
    },
  },
  {
    name: "get_orders",
    description: "List orders by status (open / closed / all), most recent first.",
    inputSchema: GetOrdersArgsSchema,
    inputJsonSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "closed", "all"] },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
    handler: async (args: z.infer<typeof GetOrdersArgsSchema>) => {
      const broker = await getBroker();
      return await broker.getOrders(args);
    },
  },
];
