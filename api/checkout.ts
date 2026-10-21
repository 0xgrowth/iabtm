import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
    checkJsonRequest,
    getClientIp,
    hashKey,
    isConfigured,
    overLimit,
    sendOrderNotification,
    validOrder,
} from "./_lib/notify.js";

/**
 * PUBLIC endpoint, called from the browser when the checkout button is clicked.
 *
 * There is no secret here (a secret in browser code is not a secret), so every
 * message is labelled "unverified". Protection comes from an Origin allow-list,
 * strict validation, per-IP rate limiting and per-orderId de-duplication.
 */

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

function allowedOrigins(): string[] {
    return (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const origins = allowedOrigins();

    if (!isConfigured(origins.length)) {
        console.error("Checkout notification service configuration is incomplete");
        return res.status(500).json({ error: "Notification service is not configured" });
    }

    // Blocks other websites from firing this from a visitor's browser.
    // Non-browser clients can forge Origin, so this is not authentication.
    const origin = req.headers.origin;
    if (typeof origin !== "string" || !origins.includes(origin.replace(/\/+$/, ""))) {
        return res.status(403).json({ error: "Forbidden" });
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
        const rateKey = `notify:rate:checkout:${hashKey(getClientIp(req))}`;
        if (await overLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS)) {
            res.setHeader("Retry-After", String(RATE_WINDOW_SECONDS));
            return res.status(429).json({ error: "Too many requests" });
        }

        const result = await sendOrderNotification(
            order,
            "🛒 CHECKOUT STARTED (unverified, not a confirmed order)",
            "checkout"
        );

        if (result === "sent" || result === "duplicate") {
            // Same response either way, so the browser can't probe which orderIds exist.
            return res.status(200).json({ success: true });
        }

        if (result === "processing") {
            res.setHeader("Retry-After", "10");
            return res.status(409).json({ error: "Already processing" });
        }

        return res.status(502).json({ error: "Could not send notification" });
    } catch (error) {
        console.error("Checkout notification infrastructure failed", {
            reason: error instanceof Error ? error.name : "UnknownError",
        });
        return res.status(503).json({ error: "Notification service temporarily unavailable" });
    }
}
