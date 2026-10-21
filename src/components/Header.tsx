import { useEffect, useState } from "react";

const slides = [
    "/images/banner-desk.jpg",
    "/images/banner1.jpg",
    "/images/banner-mobile.jpg",
];

interface HeaderProps {
    cartCount: number;
    onCartClick: () => void;
}

export default function Header({
    cartCount,
    onCartClick,
}: HeaderProps): import("react").JSX.Element {
    const [search, setSearch] = useState("");
    const [current, setCurrent] = useState(0);
    const [visible, setVisible] = useState(false);

    // Carousel autoplay
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % slides.length);
        }, 5000);

        return () => clearInterval(timer);
    }, []);

    // Show floating cart while scrolling, then hide after 20 seconds
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        const handleScroll = () => {
            setVisible(true);

            clearTimeout(timer);

            timer = setTimeout(() => {
                setVisible(false);
            }, 20_000);
        };

        window.addEventListener("scroll", handleScroll, {
            passive: true,
        });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            clearTimeout(timer);
        };
    }, []);

    return (
        <>
            {/* Header actions */}
            <div className="absolute right-4 top-5 z-20 flex items-center gap-4 md:right-8 md:top-8">
                {/* Desktop search */}
                <form
                    role="search"
                    onSubmit={(e) => e.preventDefault()}
                    className="group hidden h-11 w-[250px] overflow-hidden rounded-md border border-gray-300 border-3 bg-transparent md:flex"
                >
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search"
                        aria-label="Search products"
                        className="min-w-0 flex-1 appearance-none border-0 bg-transparent px-4 text-sm text-white outline-none placeholder:text-white/70 focus:bg-transparent focus:ring-0"
                    />

                    <button
                        type="submit"
                        aria-label="Submit search"
                        className="flex w-12 shrink-0 items-center justify-center bg-transparent hover:bg-white/10"
                    >
                        <img
                            src="/images/search.png"
                            alt=""
                            className="h-5 w-5.5 brightness-0 invert"
                        />
                    </button>
                </form>

                {/* Header cart */}
                <button
                    type="button"
                    onClick={onCartClick}
                    aria-label={`Open cart, ${cartCount} items`}
                    className="relative flex h-10 w-10 items-center justify-center text-white"
                >
                    <CartIcon />

                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-xs text-white">
                        {cartCount}
                    </span>
                </button>
            </div>

            {/* Floating cart: visible for 20 seconds after scrolling */}
            <button
                type="button"
                onClick={onCartClick}
                aria-label={`Open cart, ${cartCount} items`}
                aria-hidden={!visible}
                tabIndex={visible ? 0 : -1}
                className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl bg-gray-900 px-5 py-4 text-white shadow-lg transition-all duration-300 ease-in-out ${visible
                        ? "visible translate-y-0 opacity-100"
                        : "invisible pointer-events-none translate-y-3 opacity-0"
                    }`}
            >
                <CartIcon />

                <span className="text-sm font-medium">View cart</span>

                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-gray-900">
                    {cartCount}
                </span>
            </button>

            {/* Hero carousel */}
            <section className="relative h-[450px] w-full overflow-hidden md:h-[550px]">
                {/* Carousel images */}
                {slides.map((slide, index) => (
                    <img
                        key={slide}
                        src={slide}
                        alt={`SEVOQUE banner ${index + 1}`}
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${current === index ? "opacity-100" : "opacity-0"
                            }`}
                    />
                ))}

                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/25" />

                {/* Hero text */}
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-5 text-center text-white">
                    <h1 className="text-4xl font-bold tracking-wider md:text-6xl">
                        SEVOQUE
                    </h1>

                    <div className="my-4 h-px w-20 bg-white" />

                    <p className="text-base md:text-xl">
                        Join thousands of users who shop with SEVOQUE
                    </p>

                    <p className="mt-2 text-base font-medium md:text-xl">
                        Luxury Damask or nothing else.
                    </p>
                </div>

                {/* Slide indicators */}
                <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
                    {slides.map((slide, index) => (
                        <button
                            key={slide}
                            type="button"
                            onClick={() => setCurrent(index)}
                            aria-label={`Go to slide ${index + 1}`}
                            aria-current={current === index ? "true" : undefined}
                            className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full transition-all duration-300 ${current === index
                                ? "scale-110 opacity-100 ring-2 ring-white ring-offset-2 ring-offset-black/40"
                                : "opacity-60 ring-1 ring-white/40 hover:opacity-100"
                                }`}
                        >
                            <img
                                src={slide}
                                alt=""
                                className="h-full w-full object-cover"
                                draggable={false}
                            />
                        </button>
                    ))}
                </div>
            </section>
        </>
    );
}

function CartIcon(): import("react").JSX.Element {
    return (
        <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 18 20"
            className="h-6 w-6"
        >
            <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 0h8m-8 0-1-4m9 4a2 2 0 1 0 0 4 2 2 0 0 0-2 0Zm-9-4h10l2-7H3m2 7L3 4m0 0-.792-3H1"
            />
        </svg>
    );
}