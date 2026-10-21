export default function Footer() {
    return (
        <>
            <section className="bg-gray-100 px-4 py-10 text-center">
                <h2 className="text-xl font-bold tracking-wide md:text-2xl">
                    MAKE A PURCHASE TODAY AND ENJOY 10% OFF ON ALL 10 YARDS AND ABOVE.
                </h2>
            </section>

            <footer className="bg-[#0D1821] text-white">
                <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
                    <div className="grid gap-12 md:grid-cols-2">

                        {/* Newsletter */}
                        <div>
                            <h2 className="text-xl font-semibold">
                                Want Discounts?
                            </h2>

                            <p className="mt-2 text-sm text-gray-400">
                                win a game of chess on Lagos Life. Drop username below.
                            </p>

                            <div className="mt-5 flex max-w-lg overflow-hidden rounded-md bg-white">
                                <input
                                    type="text"
                                    placeholder="username"
                                    className="min-w-0 flex-1 px-4 py-3 text-black outline-none"
                                />

                                <button className="bg-[#f1b403] px-5 font-medium text-black">
                                    Submit
                                </button>
                            </div>

                            <div className="mt-8">
                                <a
                                    href="/"
                                    className="text-sm hover:underline"
                                >
                                    About Us
                                </a>
                            </div>
                        </div>

                        {/* Contact */}
                        <div>
                            <a
                                href="https://wa.me/+2347068649460?text=I'd%20like%20to%20setup%20an%20online%20store%20like%20yours"
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block text-sm text-gray-300 hover:text-white"
                            >
                            <h3 className="text-lg font-semibold">
                                CONTACT US
                            </h3>
                            </a>

                            <p className="mt-4 text-gray-300">
                                📍 Delivery Nationwide.
                            </p>

                            <h2 className="mt-4 text-lg font-semibold">₦</h2>
                            <h2 className="mt-4 text-lg font-semibold">USDT</h2>
                        </div>
                    </div>

                    <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-gray-500">
                        © {new Date().getFullYear()} SEVOQUE. All rights reserved.
                    </div>
                </div>
            </footer>
        </>
    );
}
