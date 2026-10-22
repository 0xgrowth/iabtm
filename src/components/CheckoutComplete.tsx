import { useEffect, useRef } from "react";

interface CheckoutCompleteModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    message?: string;
    buttonLabel?: string;
}

export default function CheckoutCompleteModal({
    open,
    onClose,
    title = "Checkout complete",
    message = "Thank you for your order. We'll be in touch shortly.",
    buttonLabel = "Continue shopping",
}: CheckoutCompleteModalProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close on Escape, lock page scroll while open, focus the button.
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKeyDown);
        buttonRef.current?.focus();

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm md:backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="checkout-complete-title"
                aria-describedby="checkout-complete-message"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-sm animate-[popIn_200ms_ease-out] rounded-2xl bg-white p-8 text-center shadow-xl"
            >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <svg
                        className="h-8 w-8 text-green-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <h2
                    id="checkout-complete-title"
                    className="text-xl font-semibold text-gray-900"
                >
                    {title}
                </h2>

                <p
                    id="checkout-complete-message"
                    className="mt-2 text-sm text-gray-600"
                >
                    {message}
                </p>

                <button
                    ref={buttonRef}
                    type="button"
                    onClick={onClose}
                    className="mt-6 w-full rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                    {buttonLabel}
                </button>
            </div>

            <style>{`
                @keyframes popIn {
                    from { opacity: 0; transform: scale(0.95) translateY(8px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
