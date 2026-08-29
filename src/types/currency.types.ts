export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface ManagedCurrency extends Currency {
  createdAt: string;
  updatedAt: string;
}

export interface ProductPrice {
  currencyId: string;
  currency: string;
  name: string;
  symbol: string;
  amount: number;
}

export interface ProductPriceInput {
  currencyId: string;
  amount: number;
}
