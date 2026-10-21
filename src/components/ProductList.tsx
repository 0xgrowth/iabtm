import type { Product } from "../types";

interface ProductListProps {
    products: Product[];
    onAddToCart: (product: Product) => void;
}

export default function ProductList({
    products,
    onAddToCart,
}: ProductListProps) {
    if (products.length === 0) {
        return (
            <div className="py-20 text-center">
                <p className="text-gray-500">
                    No products available in this collection.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
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
                            <span className="hidden md:inline">
                            Add to Cart
                            </span>

                            <span className="inline md:hidden">
                                BUY +
                            </span>
                        </button>
                    </div>
                </article>
            ))}
        </div>
    );
}
