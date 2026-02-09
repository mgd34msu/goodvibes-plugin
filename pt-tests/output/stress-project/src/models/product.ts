/**
 * Product model with pricing and inventory management
 */

export type ProductCategory = 'electronics' | 'clothing' | 'food' | 'books' | 'other';

export interface ProductInterface {
  id: string;
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  inStock: boolean;
  quantity: number;
  sku: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

/**
 * Product entity with inventory tracking
 */
export class Product implements ProductInterface {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public price: number,
    public category: ProductCategory,
    public quantity: number = 0,
    public sku: string = '',
    public tags: string[] = [],
    public metadata: Record<string, unknown> = {}
  ) {}

  /**
   * Check if product is in stock
   */
  get inStock(): boolean {
    return this.quantity > 0;
  }

  /**
   * Calculate discounted price
   */
  calculateDiscount(percentage: number): number {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Discount percentage must be between 0 and 100');
    }
    return this.price * (1 - percentage / 100);
  }

  /**
   * Add quantity to inventory
   */
  addStock(amount: number): void {
    if (amount < 0) {
      throw new Error('Cannot add negative stock');
    }
    this.quantity += amount;
  }

  /**
   * Remove quantity from inventory
   */
  removeStock(amount: number): void {
    if (amount < 0) {
      throw new Error('Cannot remove negative stock');
    }
    if (amount > this.quantity) {
      throw new Error('Insufficient stock');
    }
    this.quantity -= amount;
  }

  /**
   * Check if product is low on stock
   */
  isLowStock(threshold: number = 10): boolean {
    return this.quantity > 0 && this.quantity <= threshold;
  }

  /**
   * Calculate total value of inventory
   */
  getInventoryValue(): number {
    return this.price * this.quantity;
  }

  /**
   * Add tags to product
   */
  addTags(...newTags: string[]): void {
    this.tags = [...new Set([...this.tags, ...newTags])];
  }

  /**
   * Remove tags from product
   */
  removeTags(...tagsToRemove: string[]): void {
    this.tags = this.tags.filter(tag => !tagsToRemove.includes(tag));
  }

  /**
   * Update metadata
   */
  updateMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  /**
   * Convert to plain object
   */
  toJSON(): ProductInterface {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      price: this.price,
      category: this.category,
      inStock: this.inStock,
      quantity: this.quantity,
      sku: this.sku,
      tags: [...this.tags],
      metadata: { ...this.metadata },
    };
  }
}
