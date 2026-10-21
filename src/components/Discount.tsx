import type { Product } from "../types";

interface ProductListProps {
    products: Product[];
    onAddToCart: (product: Product) => void;
}

export default function Discount({
    products,
    onAddToCart,
}: ProductListProps): import("react").JSX.Element {
    // Handle a collection with no products at all.
    if (products.length === 0) {
        return (
            <div className="py-20 text-center">
                <p className="text-gray-500">
                    No products available in this collection.
                </p>
            </div>
        );
    }

    // Keep only products that have a discount.
    const discountedProducts = products.filter(
        (product) => product.discount === "yes"
    );

    // Handle a collection with products but no discounts.
    if (discountedProducts.length === 0) {
        return (
            <div className="py-20 text-center">
                <p className="text-gray-500">
                    No discounted products available.
                </p>
            </div>
        );
    }

    return (
        <>
            <div>
                <span className="inline-block text-sm font-semibold uppercase tracking-wide text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)] drop-shadow-[0_0_15px_rgba(245,158,11,0.7)] animate-pulse">
                    10% OFF on all 10 yards and above
                </span>

                <br />

                <h2 className="text-2xl font-bold text-gray-900">
                    Discounted Products
                </h2>
            </div>

            <br />

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {discountedProducts.map((product) => (
                    <article
                        key={product.id}
                        className="group overflow-hidden rounded-lg bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="aspect-square overflow-hidden bg-gray-100">
                            <img
                                src={product.image}
                                alt={product.name}
                                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                        </div>

                        <div className="p-4">
                            <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
                                {product.collection}
                            </p>

                            <h3 className="font-medium text-gray-900">
                                {product.name}
                            </h3>

                            <p className="mt-2 font-semibold">
                                ₦{product.price.toLocaleString()}
                            </p>

                            <button
                                onClick={() => onAddToCart(product)}
                                className="mt-4 w-full rounded-md bg-black py-3 text-sm font-medium text-white transition hover:bg-gray-800"
                            >
                                Add to Cart
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </>
    );
}