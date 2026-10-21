import { useState } from "react";

interface TelegramResponse {
    success?: boolean;
    error?: string;
}

export default function SimpleForm(): import("react").JSX.Element {
    const [name, setName] = useState("");
    const [number, setNumber] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (
        e: React.FormEvent<HTMLFormElement>
    ): Promise<void> => {
        e.preventDefault();

        setLoading(true);
        setMessage("Sending...");

        try {
            const response = await fetch("/api/send-telegram", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, number }),
            });

            const data: TelegramResponse = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Failed to send message."
                );
            }

            setMessage("Message sent successfully!");
            setName("");
            setNumber("");
        } catch (error: unknown) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Something went wrong."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-md space-y-4"
        >
            <div>
                <label
                    htmlFor="name"
                    className="mb-1 block text-sm font-medium"
                >
                    Delivery Details
                </label>

                <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter text"
                    className="w-full rounded-md border p-3 outline-none focus:ring-2 focus:ring-black"
                    required
                />
            </div>

            <div>
                <label
                    htmlFor="number"
                    className="mb-1 block text-sm font-medium"
                >
                    WhatsApp Number
                </label>

                <input
                    id="number"
                    type="number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Enter number"
                    className="w-full rounded-md border p-3 outline-none focus:ring-2 focus:ring-black"
                    required
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-black px-5 py-3 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {loading ? "Sending..." : "CHECK OUT"}
            </button>

            {message && (
                <p role="status" aria-live="polite" className="text-sm">
                    {message}
                </p>
            )}
        </form>
    );
}