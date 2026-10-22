import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
    checkJsonRequest,
    checkOrder,
    debugFields,
    describeError,
    getClientIp,
    hashKey,
    log,
    missingConfig,
    newRequestId,
    overLimit,
    sendOrderNotification,
} from "./_lib/notify.js";
import type { OrderPayload } from "./_lib/notify.js";

/**
 * PUBLIC endpoint, called from the browser when the checkout button is clicked.
 *
 * There is no secret here (a secret in browser code is not a secret), so every
 * message is labelled "unverified". Protection comes from an Origin allow-list,
 * strict validation, per-IP rate limiting and per-orderId de-duplication.
 *
 * Every response includes a requestId. Search it in Vercel -> Logs to see the
 * full story of that request. Set NOTIFY_DEBUG=1 to also get the cause in the
 * response body under "debug".
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

    const missing = missingConfig(["ALLOWED_ORIGINS"]);
    if (missing.length > 0) {
        log("error", requestId, "checkout.config_missing", { missing });
        return fail(
            500,
            "Notification service is not configured",
            debugFields({ missing })
        );
    }

    // Blocks other websites from firing this from a visitor's browser.
    // Non-browser clients can forge Origin, so this is not authentication.
    const origins = allowedOrigins();
    const origin = req.headers.origin;
    if (
        typeof origin !== "string" ||
        !origins.includes(origin.replace(/\/+$/, ""))
    ) {
        log("warn", requestId, "checkout.origin_rejected", {
            origin: origin ?? null,
            allowed: origins,
        });
        return fail(
            403,
            "Forbidden",
            debugFields({ receivedOrigin: origin ?? null, allowedOrigins: origins })
        );
    }

    const invalid = checkJsonRequest(req);
    if (invalid) {
        log("warn", requestId, "checkout.bad_request", { ...invalid });
        return fail(invalid.status, invalid.error);
    }

    // The public checkout route always requires the customer's name and phone.
    const problem = checkOrder(req.body, { requireContact: true });
    if (problem) {
        log("warn", requestId, "checkout.invalid_payload", { problem });
        return fail(400, "Invalid order payload", { problem });
    }

    const order = req.body as OrderPayload;

    try {
        const rateKey = `notify:rate:checkout:${hashKey(getClientIp(req))}`;
        if (await overLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS)) {
            log("warn", requestId, "checkout.rate_limited");
            res.setHeader("Retry-After", String(RATE_WINDOW_SECONDS));
            return fail(429, "Too many requests");
        }

        log("info", requestId, "checkout.received", {
            orderRef: hashKey(order.orderId.trim()).slice(0, 8),
            items: order.items.length,
        });

        const outcome = await sendOrderNotification(
            order,
            "🛒 CHECKOUT STARTED (unverified, not a confirmed order)",
            "checkout",
            requestId
        );

        switch (outcome.status) {
            case "sent":
            case "duplicate":
                // Same response either way, so the browser can't probe which orderIds exist.
                return res.status(200).json({ success: true, requestId });

            case "unconfirmed":
                // Probably delivered, but Telegram's reply was lost. Not an error for the browser.
                return res.status(202).json({
                    success: true,
                    unconfirmed: true,
                    requestId,
                    ...debugFields({ reason: outcome.reason, detail: outcome.detail }),
                });

            case "processing":
                res.setHeader("Retry-After", "10");
                return fail(409, "Already processing");

            default:
                return fail(
                    502,
                    "Could not send notification",
                    debugFields({ reason: outcome.reason, detail: outcome.detail })
                );
        }
    } catch (error) {
        log("error", requestId, "checkout.infrastructure_failed", describeError(error));
        return fail(
            503,
            "Notification service temporarily unavailable",
            debugFields({ error: describeError(error) })
        );
    }
}
