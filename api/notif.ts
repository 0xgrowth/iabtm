import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import {
    checkJsonRequest,
    isConfigured,
    overLimit,
    sendOrderNotification,
    validOrder,
} from "./_lib/notify.js";

/**
 * SERVER-TO-SERVER endpoint. Call it from your own backend (order creation,
 * payment-provider webhook handler, etc.) with the x-order-webhook-secret
 * header. The secret must never be placed in browser code.
 */

// Generous: all legitimate traffic comes from your own server(s).
const RATE_LIMIT = 120;
const RATE_WINDOW_SECONDS = 60;

function safeEqual(a: string, b: string): boolean {
    const first = Buffer.from(a, "utf8");
    const second = Buffer.from(b, "utf8");

    return first.length === second.length && timingSafeEqual(first, second);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = process.env.ORDER_WEBHOOK_SECRET;

    if (!isConfigured(secret)) {
        console.error("Notification service configuration is incomplete");
        return res.status(500).json({ error: "Notification service is not configured" });
    }

    const suppliedSecret = req.headers["x-order-webhook-secret"];
    if (
        typeof suppliedSecret !== "string" ||
        !safeEqual(suppliedSecret, secret as string)
    ) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const invalid = checkJsonRequest(req);
    if (invalid) {
        return res.status(invalid.status).json({ error: invalid.error });
    }

    if (!validOrder(req.body)) {
        return res.status(400).json({ error: "Invalid order payload" });
    }

    const order = req.body;

    try {
        // Keyed on the endpoint, not the IP: callers are your own servers.
        if (await overLimit("notify:rate:order", RATE_LIMIT, RATE_WINDOW_SECONDS)) {
            res.setHeader("Retry-After", String(RATE_WINDOW_SECONDS));
            return res.status(429).json({ error: "Too many requests" });
        }

        const result = await sendOrderNotification(order, "🛍️ NEW SEVOQUE ORDER", "order");

        if (result === "sent") {
            return res.status(200).json({ success: true, message: "Order notification sent" });
        }

        if (result === "duplicate") {
            return res.status(200).json({ success: true, duplicate: true });
        }

        if (result === "processing") {
            res.setHeader("Retry-After", "10");
            return res.status(409).json({ error: "Order notification is already processing" });
        }

        return res.status(502).json({ error: "Could not send Telegram notification" });
    } catch (error) {
        console.error("Notification infrastructure failed", {
            reason: error instanceof Error ? error.name : "UnknownError",
        });
        return res.status(503).json({ error: "Notification service temporarily unavailable" });
    }
}
