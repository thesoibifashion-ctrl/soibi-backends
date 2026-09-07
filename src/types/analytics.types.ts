export interface AnalyticsRange { from?: string; to?: string; }
export interface CurrencyTotal {
  currency: string | null;
  totalSnapshot: number;
}
export interface AdminAnalyticsOverview {
  products: { total: number; published: number; draft: number; featured: number; hero: number; totalViews: number; topProducts: Array<{ id: string; name: string; views: number }> };
  quotes: { total: number; byStatus: Record<string, number>; totalValue: number; recent: Array<{ id: string; referenceNumber: string; status: string; createdAt: string }> };
  carts: { total: number; active: number; submitted: number; byStatus: Record<string, number>; totalValueByCurrency: CurrencyTotal[]; recent: Array<{ id: string; orderNumber: string | null; status: string; createdAt: string }> };
  users: { total: number; new: number };
  contacts: { total: number; unread: number; recent: Array<{ id: string; name: string; createdAt: string }> };
  academy: { total: number; byStatus: Record<string, number>; byExperienceLevel: Record<string, number> };
}
