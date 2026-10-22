import type { VercelRequest } from "@vercel/node";
import { createHash, randomUUID } from "node:crypto";

export interface CheckoutItem {
    name: string;
    quantity: number;
}

export interface OrderPayload {
    orderId: string;
    customerName?: string;
    customerPhone?: string;
    total: number;
    currency: string;
    items: CheckoutItem[];
}

/**
 * "unconfirmed": the connection dropped after the request may have reached
 * Telegram (ECONNRESET etc.), so the message might or might not have been
 * delivered. We keep the dedupe lock rather than risk a duplicate.
 */
export type SendStatus =
    | "sent"
    | "duplicate"
    | "processing"
    | "failed"
    | "unconfirmed";

// Network errors where Telegram may already have received the request.
const AMBIGUOUS_NETWORK_CODES = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]);

export interface SendOutcome {
    status: SendStatus;
    /** Short machine-readable cause when status is "failed", e.g. "telegram_http_400". */
    reason?: string;
    /** Human-readable explanation (includes Telegram's own error text). Never contains secrets. */
    detail?: string;
}

export const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_LISTED_ITEMS = 20;
const PROCESSING_TTL_SECONDS = 300;
const SENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_ORDER_TOTAL = 1_000_000_000_000;

// Keep these rules identical to src/lib/checkoutContact.ts.
const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,30}$/;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

const REQUIRED_ENV = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
];

/* -------------------------------------------------------------------------- */
/* Logging and debugging helpers                                              */
/* -------------------------------------------------------------------------- */

/** Short ID returned in every response (and the x-request-id header) and written to every log line. */
export function newRequestId(): string {
    return randomUUID().slice(0, 8);
}

/** Replaces the bot token with [redacted] so it can never leak through an error message. */
function redact(text: string): string {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    return token ? text.split(token).join("[redacted]") : text;
}

/**
 * One JSON line per event, easy to search in Vercel -> Logs (search the requestId).
 * Never put secrets in `data`.
 */
export function log(
    level: "info" | "warn" | "error",
    requestId: string,
    event: string,
    data: Record<string, unknown> = {}
): void {
    const line = redact(JSON.stringify({ requestId, event, ...data }));

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

export function describeError(error: unknown): {
    name: string;
    code?: string;
    message: string;
} {
    if (!(error instanceof Error)) {
        return { name: "UnknownError", message: redact(String(error)).slice(0, 300) };
    }

    // Node's fetch hides the real cause (ENOTFOUND, ECONNRESET...) in error.cause.
    const cause = (error as { cause?: { code?: string } }).cause;

    return {
        name: error.name,
        code: cause?.code,
        message: redact(error.message).slice(0, 300),
    };
}

/** Set NOTIFY_DEBUG=1 in Vercel to include failure details in API responses. Turn it off afterwards. */
function debugEnabled(): boolean {
    return process.env.NOTIFY_DEBUG === "1";
}

/** Spread into an error response. Adds nothing unless NOTIFY_DEBUG=1. */
export function debugFields(info: Record<string, unknown>): {
    debug?: Record<string, unknown>;
} {
    return debugEnabled() ? { debug: info } : {};
}

/** Names (never values) of required environment variables that are not set. */
export function missingConfig(extra: string[] = []): string[] {
    return [...REQUIRED_ENV, ...extra].filter((name) => !process.env[name]);
}

/** Spots the usual copy-paste mistakes in the Telegram settings, without revealing the values. */
export function configProblems(): string[] {
    const problems: string[] = [];
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
    const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "");

    if (token !== token.trim()) {
        problems.push("TELEGRAM_BOT_TOKEN has leading or trailing whitespace");
    }
    if (/^["']|["']$/.test(token.trim())) {
        problems.push("TELEGRAM_BOT_TOKEN is wrapped in quotes");
    }

    const bareToken = unquote(token);
    if (/^bot/i.test(bareToken)) {
        problems.push('TELEGRAM_BOT_TOKEN starts with "bot"; use only the token from BotFather');
    }
    if (!/^\d{6,}:[A-Za-z0-9_-]{25,}$/.test(bareToken.replace(/^bot/i, ""))) {
        problems.push("TELEGRAM_BOT_TOKEN does not look like a BotFather token (expected 123456789:AAAA...)");
    }

    if (chatId !== chatId.trim() || /^["']|["']$/.test(chatId.trim())) {
        problems.push("TELEGRAM_CHAT_ID has whitespace or quotes around it");
    }
    if (!/^(-?\d+|@\w+)$/.test(unquote(chatId))) {
        problems.push("TELEGRAM_CHAT_ID should be a number (negative for groups) or @channelname");
    }

    return problems;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function cleanText(value: string, maxLength: number): string {
    return value
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

/** Returns null when the order is valid, otherwise a message naming the first problem. */
export function checkOrder(
    body: unknown,
    options: { requireContact?: boolean } = {}
): string | null {
    const requireContact = options.requireContact === true;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "body must be a JSON object (is the Content-Type application/json and the body valid JSON?)";
    }

    const order = body as Record<string, unknown>;

    if (typeof order.orderId !== "string" || order.orderId.trim().length < 1) {
        return "orderId must be a non-empty string";
    }
    if (order.orderId.length > 100) {
        return "orderId must be at most 100 characters";
    }
    if (typeof order.total !== "number" || !Number.isFinite(order.total)) {
        return "total must be a finite number";
    }
    if (order.total < 0 || order.total > MAX_ORDER_TOTAL) {
        return "total is out of range";
    }
    // Tolerance instead of exact equality: 1.15 * 100 === 114.99999999999999
    if (Math.abs(order.total * 100 - Math.round(order.total * 100)) > 1e-6) {
        return "total must have at most 2 decimal places";
    }
    if (typeof order.currency !== "string" || !/^[A-Z]{3}$/.test(order.currency)) {
        return "currency must be a 3-letter uppercase code such as NGN";
    }
    if (!Array.isArray(order.items) || order.items.length < 1) {
        return "items must be a non-empty array";
    }
    if (order.items.length > 50) {
        return "items must have at most 50 entries";
    }
    const name = order.customerName;
    if (
        name !== undefined &&
        (typeof name !== "string" || name.length > NAME_MAX_LENGTH)
    ) {
        return `customerName must be a string of at most ${NAME_MAX_LENGTH} characters`;
    }
    if (
        requireContact &&
        (typeof name !== "string" || name.trim().length < NAME_MIN_LENGTH)
    ) {
        return `customerName is required (at least ${NAME_MIN_LENGTH} characters)`;
    }

    const phone = order.customerPhone;
    if (phone !== undefined) {
        const digits = typeof phone === "string" ? phone.replace(/\D/g, "").length : 0;
        if (
            typeof phone !== "string" ||
            !PHONE_PATTERN.test(phone.trim()) ||
            digits < PHONE_MIN_DIGITS ||
            digits > PHONE_MAX_DIGITS
        ) {
            return "customerPhone must be a valid phone number (7 to 15 digits, may start with +)";
        }
    } else if (requireContact) {
        return "customerPhone is required";
    }

    for (let i = 0; i < order.items.length; i++) {
        const item: unknown = order.items[i];

        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return `items[${i}] must be an object`;
        }

        const product = item as Record<string, unknown>;

        if (
            typeof product.name !== "string" ||
            product.name.trim().length === 0 ||
            product.name.length > 150
        ) {
            return `items[${i}].name must be a non-empty string of at most 150 characters`;
        }
        if (
            !Number.isSafeInteger(product.quantity) ||
            (product.quantity as number) < 1 ||
            (product.quantity as number) > 10000
        ) {
            return `items[${i}].quantity must be an integer from 1 to 10000`;
        }
    }

    return null;
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
        (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
    ) {
        return { status: 413, error: "Request body too large" };
    }

    return null;
}

/* -------------------------------------------------------------------------- */
/* Redis (Upstash REST)                                                       */
/* -------------------------------------------------------------------------- */

async function redisCommand<T = unknown>(...command: string[]): Promise<T> {
    const name = command[0];
    const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!rawUrl || !token) {
        throw new Error(
            "Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)"
        );
    }

    const url = rawUrl.trim().replace(/\/+$/, "");
    if (!url.startsWith("https://")) {
        throw new Error(
            "UPSTASH_REDIS_REST_URL must start with https:// (use the REST URL, not the redis:// connection string)"
        );
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
        throw new Error(`Redis ${name} failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as { result?: T; error?: string };

    if (data.error) {
        throw new Error(`Redis ${name} failed: ${data.error}`);
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

/* -------------------------------------------------------------------------- */
/* Telegram                                                                   */
/* -------------------------------------------------------------------------- */

interface TelegramResponse {
    ok?: boolean;
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number; migrate_to_chat_id?: number };
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
        `Phone: ${cleanText(order.customerPhone || "Not provided", 30)}`,
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

/** Turns Telegram's error into a plain-English next step. */
function telegramHint(
    status: number,
    description: string,
    params: TelegramResponse["parameters"]
): string {
    const text = description.toLowerCase();

    if (params?.migrate_to_chat_id !== undefined) {
        return `The group was upgraded to a supergroup. Set TELEGRAM_CHAT_ID to ${params.migrate_to_chat_id}.`;
    }
    if (status === 401) {
        return "Telegram rejected the bot token. Copy it again from BotFather into TELEGRAM_BOT_TOKEN.";
    }
    if (status === 404) {
        return 'Telegram does not recognise this bot URL. TELEGRAM_BOT_TOKEN is probably malformed (extra "bot" prefix, quotes or spaces).';
    }
    if (text.includes("chat not found")) {
        return "Chat not found. Check TELEGRAM_CHAT_ID, and make sure you have sent a message to the bot (or added it to the group) first.";
    }
    if (text.includes("can't initiate") || text.includes("blocked")) {
        return "The bot is not allowed to message this chat. Open the bot in Telegram and press Start (or unblock it).";
    }
    if (text.includes("kicked") || text.includes("not a member")) {
        return "The bot is no longer in this group or channel. Add it back.";
    }
    if (status === 429) {
        return `Telegram is rate limiting this bot. Retry after ${params?.retry_after ?? "a few"} seconds.`;
    }
    if (status === 400) {
        return "Telegram rejected the request. See Telegram's description.";
    }

    return "Unexpected Telegram response. See Telegram's description.";
}

function failureFromError(error: unknown): SendOutcome {
    const info = describeError(error);

    if (info.name === "TimeoutError" || info.name === "AbortError") {
        return {
            status: "failed",
            reason: "telegram_timeout",
            detail: "Telegram did not respond within 8 seconds.",
        };
    }

    if (info.code && AMBIGUOUS_NETWORK_CODES.has(info.code)) {
        return {
            status: "unconfirmed",
            reason: "telegram_connection_dropped",
            detail:
                `The connection dropped (${info.code}) before Telegram's reply arrived. ` +
                "The message may well have been delivered; check Telegram. " +
                "If this happens often, suspect a VPN, antivirus or flaky network on the machine running this code.",
        };
    }

    if (info.code) {
        // e.g. ENOTFOUND, ECONNREFUSED (the request never reached Telegram)
        return {
            status: "failed",
            reason: "telegram_network_error",
            detail: `Network error (${info.code}) while reaching api.telegram.org.`,
        };
    }

    return {
        status: "failed",
        reason: "unexpected_error",
        detail: `${info.name}: ${info.message}`,
    };
}

/**
 * Sends the Telegram message once per orderId (per kind).
 * Telegram problems come back as { status: "failed", reason, detail }.
 * Redis problems are thrown so the caller can answer 503.
 */
export async function sendOrderNotification(
    order: OrderPayload,
    title: string,
    kind: "checkout" | "order",
    requestId: string
): Promise<SendOutcome> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");
    }

    const orderHash = hashKey(order.orderId.trim());
    const orderRef = orderHash.slice(0, 8); // safe to log; not reversible
    const message = buildMessage(order, title);

    // Separate namespaces so a "checkout started" alert never blocks the
    // real "order" alert for the same orderId.
    const idempotencyKey = `notify:${kind}:${orderHash}`;

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
        const status: SendStatus = state === "sent" ? "duplicate" : "processing";
        log("info", requestId, `notify.${status}`, { kind, orderRef });
        return { status };
    }

    const problems = configProblems();
    if (problems.length > 0) {
        log("warn", requestId, "notify.config_problems", { problems });
    }

    const startedAt = Date.now();
    let outcome: SendOutcome;

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: message }),
                signal: AbortSignal.timeout(8000),
            }
        );

        const body = (await response.json().catch(() => null)) as TelegramResponse | null;
        const elapsedMs = Date.now() - startedAt;

        if (response.ok && body?.ok === true) {
            outcome = { status: "sent" };
            log("info", requestId, "telegram.sent", { kind, orderRef, elapsedMs });
        } else {
            const description = redact(
                (body ? body.description ?? "" : "response was not valid JSON").slice(0, 200)
            );
            const hint = telegramHint(response.status, description, body?.parameters);

            outcome = {
                status: "failed",
                reason: `telegram_http_${response.status}`,
                detail:
                    hint +
                    (description ? ` (Telegram says: ${description})` : "") +
                    (problems.length > 0 ? ` Config hints: ${problems.join("; ")}.` : ""),
            };

            log("error", requestId, "telegram.rejected", {
                kind,
                orderRef,
                status: response.status,
                errorCode: body?.error_code,
                description,
                hint,
                configProblems: problems,
                elapsedMs,
            });
        }
    } catch (error) {
        outcome = failureFromError(error);
        const unconfirmed = outcome.status === "unconfirmed";
        log(unconfirmed ? "warn" : "error", requestId, unconfirmed ? "telegram.unconfirmed" : "telegram.request_failed", {
            kind,
            orderRef,
            reason: outcome.reason,
            ...describeError(error),
            configProblems: problems,
        });
    }

    if (outcome.status === "unconfirmed") {
        // Leave the "processing" claim in place (it expires on its own after
        // 5 minutes) so an immediate retry cannot double-send.
        return outcome;
    }

    if (outcome.status === "failed") {
        // Release the claim so a retry is possible.
        try {
            await redisCommand("DEL", idempotencyKey);
        } catch (error) {
            log("error", requestId, "redis.release_failed", describeError(error));
        }

        return outcome;
    }

    // The message is already delivered. If recording that fails we still report
    // success; the worst case is a duplicate alert once the 5-minute claim expires.
    try {
        await redisCommand("SET", idempotencyKey, "sent", "EX", String(SENT_TTL_SECONDS));
    } catch (error) {
        log("error", requestId, "redis.mark_sent_failed", describeError(error));
    }

    return outcome;
}
