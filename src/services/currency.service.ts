import { AppError } from '../utils/AppError.js';
import * as repository from '../repositories/currency.repository.js';
import type { Currency, ManagedCurrency } from '../types/currency.types.js';
export const getActiveCurrencies = (): Promise<Currency[]> => repository.findActiveCurrencies();
export async function assertActiveCurrencyCodes(codes: string[]): Promise<void> {
  const uniqueCodes = [...new Set(codes)];
  const activeCodes = await repository.findActiveCurrencyCodes(uniqueCodes);
  const unavailable = uniqueCodes.filter((code) => !activeCodes.includes(code));
  if (unavailable.length > 0) {
    throw AppError.badRequest(`Currency is not active or does not exist: ${unavailable.join(', ')}`);
  }
}
export const getManagedCurrencies = (): Promise<ManagedCurrency[]> => repository.findAllCurrencies();
export const createManagedCurrency = (input: Parameters<typeof repository.createCurrency>[0]) => repository.createCurrency(input);
export async function updateManagedCurrency(id: string, input: Parameters<typeof repository.updateCurrency>[1]): Promise<ManagedCurrency> {
  if (input.isActive === false) { const all = await repository.findAllCurrencies(); if (all.find((currency) => currency.id === id)?.isDefault) throw AppError.badRequest('Set another default currency before deactivating this currency'); }
  const currency = await repository.updateCurrency(id, input); if (!currency) throw AppError.notFound('Currency not found'); return currency;
}
export async function makeDefaultCurrency(id: string): Promise<ManagedCurrency> { const currency = await repository.setDefaultCurrency(id); if (!currency) throw AppError.notFound('Currency not found'); return currency; }
export async function removeManagedCurrency(id: string): Promise<void> { const result = await repository.deactivateCurrency(id); if (result === 'default') throw AppError.badRequest('Set another default currency before deactivating this currency'); if (!result) throw AppError.notFound('Active currency not found'); }
