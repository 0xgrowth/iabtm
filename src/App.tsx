import { useMemo, useState } from "react";

import Header from "./components/Header";
import Collections from "./components/Collections";
import ProductList from "./components/ProductList";
import Cart from "./components/Cart";
import Discount from "./components/Discount";
import Footer from "./components/Footer";

import { products } from "./data/products";

import type { CartItem, Product } from "./types";

function App() {
  const [activeCollection, setActiveCollection] =
    useState("All");

  const [cartOpen, setCartOpen] = useState(false);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const collections = useMemo(() => {
    return [
      ...new Set(products.map((product) => product.collection)),
    ];
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeCollection === "All") {
      return products;
    }

    return products.filter(
      (product) => product.collection === activeCollection
    );
  }, [activeCollection]);

  const cartCount = cartItems.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const addToCart = (product: Product) => {
    setCartItems((current) => {
      const existing = current.find(
        (item) => item.id === product.id
      );

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? {
              ...item,
              quantity: item.quantity + 1,
            }
            : item
        );
      }

      return [
        ...current,
        {
          ...product,
          quantity: 1,
        },
      ];
    });

    setCartOpen(true);
  };

  const removeFromCart = (id: number) => {
    setCartItems((current) =>
      current.filter((item) => item.id !== id)
    );
  };

  const increaseQuantity = (id: number) => {
    setCartItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
            ...item,
            quantity: item.quantity + 1,
          }
          : item
      )
    );
  };

  const decreaseQuantity = (id: number) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.id === id
            ? {
              ...item,
              quantity: item.quantity - 1,
            }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  return (
    <div className="min-h-screen bg-white text-[#0D1821]">

      <Header
        cartCount={cartCount}
        onCartClick={() => setCartOpen(true)}
      />

      <main>

        <Collections
          collections={collections}
          active={activeCollection}
          onChange={setActiveCollection}
        />

        <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-16">
          <ProductList
            products={filteredProducts}
            onAddToCart={addToCart}
          />
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-16">
          <Discount
            products={filteredProducts}
            onAddToCart={addToCart}
          />
        </section>

      </main>

      <Cart
        items={cartItems}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
        onIncrease={increaseQuantity}
        onDecrease={decreaseQuantity}
      />

      <Footer />
    </div>
  );
}

export default App;
