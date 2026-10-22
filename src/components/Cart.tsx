import { useState } from "react";
import CheckoutComplete from "../components/CheckoutComplete";
import type { CartItem } from "../types";
import { useCheckoutNotify, resetCheckoutOrderId } from "../hooks/useCheckoutNotify";
import CheckoutForm from "../components/CheckoutForm";

interface CartProps {
    items: CartItem[];
    open: boolean;
    onClose: () => void;
    onRemove: (id: number) => void;
    onIncrease: (id: number) => void;
    onDecrease: (id: number) => void;
}

export default function Cart({
    items,
    open,
    onClose,
    onRemove,
    onIncrease,
    onDecrease,
}: CartProps) {

    // const username = "x0_growth";

    // const message = "I'd like to make a purchase from the store";

    // const telegramLink = `https://t.me/${username}?text=${encodeURIComponent(
    //     message
    // )}`;
    const notifyCheckout = useCheckoutNotify();

    const [showComplete, setShowComplete] = useState(false);
    const [orderId, setOrderId] = useState(() => crypto.randomUUID());
    const [showForm, setShowForm] = useState(false);

    const total = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    return (
        <>
            {open && (
                <div
                    onClick={onClose}
                    className="fixed inset-0 z-40 bg-black/50"
                />
            )}

            <aside
                className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b px-5 py-5">
                    <h2 className="text-xl font-semibold">
                        Shopping Cart
                    </h2>

                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-2xl hover:bg-gray-100"
                    >
                        ×
                    </button>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto p-5">
                    {items.length === 0 ? (
                        <div className="flex h-full items-center justify-center">
                            <p className="text-gray-500">
                                Your cart is empty.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex gap-3 border-b pb-5"
                                >
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className="h-20 w-20 rounded-md object-cover"
                                    />

                                    <div className="flex-1">
                                        <div className="flex justify-between gap-2">
                                            <h3 className="font-medium">
                                                {item.name}
                                            </h3>

                                            <button
                                                onClick={() => onRemove(item.id)}
                                                className="text-sm text-red-500"
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        <p className="mt-1 text-sm text-gray-500">
                                            ₦{item.price.toLocaleString()}
                                        </p>

                                        <div className="mt-3 flex items-center gap-3">
                                            <button
                                                onClick={() => onDecrease(item.id)}
                                                className="h-8 w-8 rounded border"
                                            >
                                                −
                                            </button>

                                            <span>{item.quantity}</span>

                                            <button
                                                onClick={() => onIncrease(item.id)}
                                                className="h-8 w-8 rounded border"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t p-5">

                    <div className="mb-5 flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span>₦{total.toLocaleString()}</span>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 rounded-md border py-3 font-medium"
                        >
                            CLOSE
                        </button>
                        <button 
                        className="flex flex-1 items-center justify-center rounded-md bg-black py-3 font-medium text-white"
                        onClick={() => setShowForm(true)}>CHECK OUT</button>

                        <CheckoutForm
                            open={showForm}
                            onClose={() => setShowForm(false)}
                            onSubmit={({ name, phone }) => {
                                notifyCheckout({
                                    orderId,
                                    total,
                                    currency: "NGN",
                                    items: items.map((i) => ({ name: i.name, quantity: i.quantity })),
                                    customerName: name,
                                    customerPhone: phone,
                                });
                                setShowForm(false);
                                setShowComplete(true);
                            }}
                        />

                        <CheckoutComplete
                            open={showComplete}
                            onClose={() => {
                                setShowComplete(false);
                                resetCheckoutOrderId(); // so the next checkout gets a fresh order ID
                                setOrderId(crypto.randomUUID());
                                // clearCart();         // if you want to empty the cart here
                            }}
                        />
                    </div>
                </div>
            </aside>
        </>
    );
}
