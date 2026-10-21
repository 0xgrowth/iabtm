import { useCallback, useRef } from "react";

export interface CheckoutItem {
    name: string;
    quantity: number;
}

export interface CheckoutSnapshot {
    total: string;
    currency: string; // ISO 4217, e.g. "NGN"
    items: CheckoutItem[];
    customerName?: string;
}

const STORAGE_KEY = "checkoutOrderId";

/** One orderId per checkout attempt, so repeated clicks de-duplicate server-side. */
function getOrderId(): string {
    try {
        const existing = sessionStorage.getItem(STORAGE_KEY);
        if (existing) return existing;

        const created = crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, created);
        return created;
    } catch {
        // Storage blocked: fall back to an id that lives for this page view.
        return crypto.randomUUID();
    }
}

/** Call after a successful purchase so the next checkout gets a fresh orderId. */
export function resetCheckoutOrderId(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

export function useCheckoutNotify() {
    const inFlight = useRef(false);

    /** Fire-and-forget. Never throws, never blocks the checkout flow. */
    return useCallback((snapshot: CheckoutSnapshot): void => {
        if (inFlight.current) return;
        inFlight.current = true;

        const payload = {
            orderId: getOrderId(),
            total: snapshot.total,
            currency: snapshot.currency,
            items: snapshot.items.slice(0, 50),
            ...(snapshot.customerName
                ? { customerName: snapshot.customerName.slice(0, 100) }
                : {}),
        };

        fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true, // lets the request finish if the page navigates to payment
        })
            .catch(() => {
                /* a failed notification must never break checkout */
            })
            .finally(() => {
                inFlight.current = false;
            });
    }, []);
}
