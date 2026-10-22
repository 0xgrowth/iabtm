import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import {
    checkJsonRequest,
    checkOrder,
    debugFields,
    describeError,
    hashKey,
    log,
    missingConfig,
    newRequestId,
    overLimit,
    sendOrderNotification,
} from "./_lib/notify.js";
import type { OrderPayload } from "./_lib/notify.js";

/**
 * SERVER-TO-SERVER endpoint. Call it from your own backend (order creation,
 * payment-provider webhook handler, etc.) with the x-order-webhook-secret
 * header. The secret must never be placed in browser code.
 *
 * Every response includes a requestId. Search it in Vercel -> Logs to see the
 * full story of that request. Set NOTIFY_DEBUG=1 to also get the cause in the
 * response body under "debug".
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
    const requestId = newRequestId();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("x-request-id", requestId);

    const fail = (
        status: number,
        error: string,
        extra: Record<string, unknown> = {}
    ) => res.status(status).json({ error, requestId, ...extra });

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return fail(405, "Method not allowed");
    }

    const missing = missingConfig(["ORDER_WEBHOOK_SECRET"]);
    if (missing.length > 0) {
        log("error", requestId, "notif.config_missing", { missing });
        return fail(
            500,
            "Notification service is not configured",
            debugFields({ missing })
        );
    }

    const suppliedSecret = req.headers["x-order-webhook-secret"];
    if (
        typeof suppliedSecret !== "string" ||
        !safeEqual(suppliedSecret, process.env.ORDER_WEBHOOK_SECRET as string)
    ) {
        log("warn", requestId, "notif.unauthorized", {
            headerPresent: typeof suppliedSecret === "string",
        });
        return fail(401, "Unauthorized");
    }

    const invalid = checkJsonRequest(req);
    if (invalid) {
        log("warn", requestId, "notif.bad_request", { ...invalid });
        return fail(invalid.status, invalid.error);
    }

    const problem = checkOrder(req.body);
    if (problem) {
        log("warn", requestId, "notif.invalid_payload", { problem });
        return fail(400, "Invalid order payload", { problem });
    }

    const order = req.body as OrderPayload;

    try {
        // Keyed on the endpoint, not the IP: callers are your own servers.
        if (await overLimit("notify:rate:order", RATE_LIMIT, RATE_WINDOW_SECONDS)) {
            log("warn", requestId, "notif.rate_limited");
            res.setHeader("Retry-After", String(RATE_WINDOW_SECONDS));
            return fail(429, "Too many requests");
        }

        log("info", requestId, "notif.received", {
            orderRef: hashKey(order.orderId.trim()).slice(0, 8),
            items: order.items.length,
        });

        const outcome = await sendOrderNotification(
            order,
            "🛍️ NEW SEVOQUE ORDER",
            "order",
            requestId
        );

        switch (outcome.status) {
            case "sent":
                return res
                    .status(200)
                    .json({ success: true, message: "Order notification sent", requestId });

            case "duplicate":
                return res.status(200).json({ success: true, duplicate: true, requestId });

            case "unconfirmed":
                // Probably delivered, but Telegram's reply was lost. Do not retry blindly: it could duplicate.
                return res.status(202).json({
                    success: true,
                    unconfirmed: true,
                    requestId,
                    ...debugFields({ reason: outcome.reason, detail: outcome.detail }),
                });

            case "processing":
                res.setHeader("Retry-After", "10");
                return fail(409, "Order notification is already processing");

            default:
                return fail(
                    502,
                    "Could not send Telegram notification",
                    debugFields({ reason: outcome.reason, detail: outcome.detail })
                );
        }
    } catch (error) {
        log("error", requestId, "notif.infrastructure_failed", describeError(error));
        return fail(
            503,
            "Notification service temporarily unavailable",
            debugFields({ error: describeError(error) })
        );
    }
}
