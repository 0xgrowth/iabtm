export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  collection: string;
  description?: string;
  discount?: string;
}

export interface CartItem extends Product {
  quantity: number;
}
