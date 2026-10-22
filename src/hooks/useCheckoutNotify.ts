import { useCallback, useRef } from "react";

export interface CheckoutItem {
    name: string;
    quantity: number;
}

export interface CheckoutSnapshot {
    orderId: string;
    customerName?: string;
    customerPhone?: string;
    total: number;
    currency: string;
    items: CheckoutItem[];
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
    return useCallback(async (snapshot: CheckoutSnapshot): Promise<void> => {
        if (inFlight.current) return;
        inFlight.current = true;

        const payload = {
    orderId: getOrderId(),
    ...(snapshot.customerName
        ? { customerName: snapshot.customerName.slice(0, 100) }
        : {}),
    ...(snapshot.customerPhone
        ? { customerPhone: snapshot.customerPhone.slice(0, 30) }
        : {}),
    total: snapshot.total,
    currency: "NGN",
    items: snapshot.items.slice(0, 50).map((item) => ({
        name: item.name,
        quantity: item.quantity,
    })),
};

        try {
            const response = await fetch("/api/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify(payload),
                credentials: "same-origin",
                keepalive: true,
            });
            
            const responseText = await response.text();

            if (!response.ok) {
                console.error("Checkout request failed:", {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseText,
                });
                return;
            }

            console.log("Checkout request succeeded:", responseText);
            
        } catch (error) {
            console.error("Checkout network error:", error);
        } finally {
            inFlight.current = false;
    }
    }, []);
}
