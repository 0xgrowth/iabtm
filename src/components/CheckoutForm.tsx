import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
    cleanContact,
    validateContact,
} from "../lib/checkoutContact";
import type { ContactDetails, ContactErrors } from "../lib/checkoutContact";

interface CheckoutFormProps {
    open: boolean;
    onClose: () => void;
    /** Called only with cleaned, validated details. */
    onSubmit: (details: ContactDetails) => void;
    title?: string;
    submitLabel?: string;
}

// Console messages never include what the customer typed, only field names.
const tag = "[CheckoutForm]";

export default function CheckoutForm({
    open,
    onClose,
    onSubmit,
    title = "Your details",
    submitLabel = "Confirm checkout",
}: CheckoutFormProps) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [errors, setErrors] = useState<ContactErrors>({});

    const nameRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);

    // Fresh, empty form each time it opens.
    useEffect(() => {
        if (!open) return;
        setName("");
        setPhone("");
        setErrors({});
        nameRef.current?.focus();
    }, [open]);

    // Close on Escape and lock page scroll while open.
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const details = cleanContact({ name, phone });
        const found = validateContact(details);

        if (found.name || found.phone) {
            console.debug(`${tag} submit blocked`, Object.keys(found));
            setErrors(found);
            (found.name ? nameRef : phoneRef).current?.focus();
            return;
        }

        console.debug(`${tag} submit ok`);
        setErrors({});
        onSubmit(details);
    }

    const inputClass = (invalid: boolean) =>
        `mt-1 w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 ${
            invalid
                ? "border-red-500 focus:ring-red-200"
                : "border-gray-300 focus:border-black focus:ring-gray-200"
        }`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <form
                noValidate
                role="dialog"
                aria-modal="true"
                aria-labelledby="checkout-form-title"
                onSubmit={handleSubmit}
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl"
            >
                <h2
                    id="checkout-form-title"
                    className="text-xl font-semibold text-gray-900"
                >
                    {title}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                    We&apos;ll use these to confirm your order.
                </p>

                <div className="mt-6">
                    <label
                        htmlFor="checkout-name"
                        className="text-sm font-medium text-gray-800"
                    >
                        Full name
                    </label>
                    <input
                        ref={nameRef}
                        id="checkout-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        maxLength={100}
                        onChange={(event) => setName(event.target.value)}
                        aria-invalid={errors.name ? true : undefined}
                        aria-describedby={errors.name ? "checkout-name-error" : undefined}
                        className={inputClass(Boolean(errors.name))}
                    />
                    {errors.name && (
                        <p
                            id="checkout-name-error"
                            role="alert"
                            className="mt-1 text-xs text-red-600"
                        >
                            {errors.name}
                        </p>
                    )}
                </div>

                <div className="mt-4">
                    <label
                        htmlFor="checkout-phone"
                        className="text-sm font-medium text-gray-800"
                    >
                        Phone number
                    </label>
                    <input
                        ref={phoneRef}
                        id="checkout-phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+234 801 234 5678"
                        value={phone}
                        maxLength={30}
                        onChange={(event) => setPhone(event.target.value)}
                        aria-invalid={errors.phone ? true : undefined}
                        aria-describedby={errors.phone ? "checkout-phone-error" : undefined}
                        className={inputClass(Boolean(errors.phone))}
                    />
                    {errors.phone && (
                        <p
                            id="checkout-phone-error"
                            role="alert"
                            className="mt-1 text-xs text-red-600"
                        >
                            {errors.phone}
                        </p>
                    )}
                </div>

                <div className="mt-6 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-1/3 rounded-full border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="w-2/3 rounded-full bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                        {submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
