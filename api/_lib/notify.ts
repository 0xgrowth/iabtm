import type { VercelRequest } from "@vercel/node";
import { createHash } from "node:crypto";

export interface OrderItem {
    name: string;
    quantity: number;
}

export interface OrderPayload {
    orderId: string;
    customerName?: string;
    total: number;
    currency: string;
    items: OrderItem[];
}

export type SendResult = "sent" | "duplicate" | "processing" | "failed";

export const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_LISTED_ITEMS = 20;
const PROCESSING_TTL_SECONDS = 300;
const SENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_ORDER_TOTAL = 1_000_000_000_000;

export function isConfigured(...extra: (string | number | undefined)[]): boolean {
    return Boolean(
        process.env.TELEGRAM_BOT_TOKEN &&
            process.env.TELEGRAM_CHAT_ID &&
            process.env.UPSTASH_REDIS_REST_URL &&
            process.env.UPSTASH_REDIS_REST_TOKEN &&
            extra.every(Boolean)
    );
}

export function cleanText(value: string, maxLength: number): string {
    return value
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

export function validOrder(body: unknown): body is OrderPayload {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return false;
    }

    const order = body as Record<string, unknown>;

    if (
        typeof order.orderId !== "string" ||
        order.orderId.trim().length < 1 ||
        order.orderId.length > 100 ||
        typeof order.total !== "number" ||
        !Number.isFinite(order.total) ||
        order.total < 0 ||
        order.total > MAX_ORDER_TOTAL ||
        // Tolerance instead of exact equality: 1.15 * 100 === 114.99999999999999
        Math.abs(order.total * 100 - Math.round(order.total * 100)) > 1e-6 ||
        typeof order.currency !== "string" ||
        !/^[A-Z]{3}$/.test(order.currency) ||
        !Array.isArray(order.items) ||
        order.items.length < 1 ||
        order.items.length > 50
    ) {
        return false;
    }

    if (
        order.customerName !== undefined &&
        (typeof order.customerName !== "string" ||
            order.customerName.length > 100)
    ) {
        return false;
    }

    return order.items.every((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return false;
        }

        const product = item as Record<string, unknown>;

        return (
            typeof product.name === "string" &&
            product.name.trim().length > 0 &&
            product.name.length <= 150 &&
            Number.isSafeInteger(product.quantity) &&
            (product.quantity as number) > 0 &&
            (product.quantity as number) <= 10000
        );
    });
}

/** Returns an error response description, or null if the request shape is fine. */
export function checkJsonRequest(
    req: VercelRequest
): { status: number; error: string } | null {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
        return { status: 415, error: "Content-Type must be application/json" };
    }

    const contentLength = req.headers["content-length"];
    if (
        contentLength !== undefined &&
        (!/^\d+$/.test(contentLength) ||
            Number(contentLength) > MAX_BODY_BYTES)
    ) {
        return { status: 413, error: "Request body too large" };
    }

    return null;
}

async function redisCommand<T = unknown>(...command: string[]): Promise<T> {
    const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        throw new Error("Redis is not configured");
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
        throw new Error(`Redis HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as { result?: T; error?: string };

    if (data.error) {
        throw new Error("Redis command failed");
    }

    return data.result as T;
}

export function getClientIp(req: VercelRequest): string {
    const pick = (name: string): string => {
        const value = req.headers[name];
        const first = Array.isArray(value) ? value[0] : value;
        return typeof first === "string" ? first.split(",")[0].trim() : "";
    };

    return (
        pick("x-real-ip") ||
        pick("x-vercel-forwarded-for") ||
        pick("x-forwarded-for") ||
        "unknown"
    );
}

export function hashKey(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

/**
 * Fixed-window counter shared across serverless instances.
 * EXPIRE ... NX runs on every call, so the key always gets a TTL
 * even if an earlier invocation died between INCR and EXPIRE.
 */
export async function overLimit(
    key: string,
    limit: number,
    windowSeconds: number
): Promise<boolean> {
    const count = await redisCommand<number>("INCR", key);
    await redisCommand("EXPIRE", key, String(windowSeconds), "NX");
    return count > limit;
}

function buildMessage(order: OrderPayload, title: string): string {
    const itemLines = order.items
        .slice(0, MAX_LISTED_ITEMS)
        .map((item) => `• ${cleanText(item.name, 150)} × ${item.quantity}`);

    if (order.items.length > MAX_LISTED_ITEMS) {
        itemLines.push(`…and ${order.items.length - MAX_LISTED_ITEMS} more`);
    }

    const message = [
        title,
        "",
        `Order ID: ${cleanText(order.orderId, 100)}`,
        `Customer: ${cleanText(order.customerName || "Not provided", 100)}`,
        `Total: ${order.currency} ${order.total.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`,
        "",
        "Items:",
        ...itemLines,
    ].join("\n");

    return message.slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * Sends the Telegram message once per orderId.
 * Throws only on Redis/config problems; Telegram failures return "failed".
 */
export async function sendOrderNotification(
    order: OrderPayload,
    title: string,
    kind: "checkout" | "order"
): Promise<SendResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        throw new Error("Telegram is not configured");
    }

    const message = buildMessage(order, title);
    // Separate namespaces so a "checkout started" alert never blocks the
    // real "order" alert for the same orderId.
    const idempotencyKey = `notify:${kind}:${hashKey(order.orderId.trim())}`;

    // Atomically claim this order so concurrent requests can't double-send.
    const claim = await redisCommand<string | null>(
        "SET",
        idempotencyKey,
        "processing",
        "NX",
        "EX",
        String(PROCESSING_TTL_SECONDS)
    );

    if (claim !== "OK") {
        const state = await redisCommand<string | null>("GET", idempotencyKey);
        return state === "sent" ? "duplicate" : "processing";
    }

    try {
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: message }),
                signal: AbortSignal.timeout(8000),
            }
        );

        const result = (await telegramResponse.json().catch(() => ({}))) as {
            ok?: boolean;
            error_code?: number;
        };

        if (!telegramResponse.ok || result.ok !== true) {
            console.error("Telegram notification failed", {
                status: telegramResponse.status,
                errorCode: result.error_code,
            });
            await redisCommand("DEL", idempotencyKey);
            return "failed";
        }

        await redisCommand(
            "SET",
            idempotencyKey,
            "sent",
            "EX",
            String(SENT_TTL_SECONDS)
        );

        return "sent";
    } catch (error) {
        // Release the claim so a retry is possible. If Telegram accepted the
        // message but the response was lost, a duplicate is possible.
        try {
            await redisCommand("DEL", idempotencyKey);
        } catch {
            console.error("Could not release notification claim");
        }

        console.error("Notification delivery failed", {
            reason: error instanceof Error ? error.name : "UnknownError",
        });

        return "failed";
    }
}
