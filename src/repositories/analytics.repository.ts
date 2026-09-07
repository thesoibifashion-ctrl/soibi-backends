import { pool } from '../database/pool.js';
import type { AdminAnalyticsOverview, AnalyticsRange } from '../types/analytics.types.js';

const n = (value: unknown) => Number(value ?? 0);
const statusCounts = (rows: Record<string, unknown>[], key = 'status') => Object.fromEntries(rows.map((row) => [String(row[key] ?? 'unspecified'), n(row['count'])]));
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((total, count) => total + count, 0);

export async function getAdminAnalytics(range: AnalyticsRange): Promise<AdminAnalyticsOverview> {
  const dates = [range.from ?? null, range.to ?? null];
  const inRange = (column: string) => `($1::date IS NULL OR ${column} >= $1::date) AND ($2::date IS NULL OR ${column} < $2::date + INTERVAL '1 day')`;
  const [products, quoteStatuses, quoteValue, recentQuotes, carts, cartStatuses, cartValue, recentCarts, users, contacts, recentContacts, academyStatuses, academyExperience, views, topProducts] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL) total, COUNT(*) FILTER (WHERE status = 'published' AND deleted_at IS NULL) published, COUNT(*) FILTER (WHERE status = 'draft' AND deleted_at IS NULL) draft, COUNT(*) FILTER (WHERE is_featured AND deleted_at IS NULL) featured, COUNT(*) FILTER (WHERE is_hero AND deleted_at IS NULL) hero FROM products`),
    pool.query(`SELECT status, COUNT(*) count FROM quote_requests WHERE ${inRange('created_at')} GROUP BY status`, dates),
    pool.query(`SELECT COALESCE(SUM(qi.quantity * COALESCE(qi.unit_price_snapshot, 0)), 0) total FROM quote_requests qr LEFT JOIN quote_items qi ON qi.quote_request_id = qr.id WHERE ${inRange('qr.created_at')}`, dates),
    pool.query(`SELECT id, reference_number, status, created_at FROM quote_requests WHERE ${inRange('created_at')} ORDER BY created_at DESC LIMIT 10`, dates),
    pool.query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status = 'active') active FROM carts WHERE ${inRange('created_at')}`, dates),
    pool.query(`SELECT status, COUNT(*) count FROM cart_history WHERE ${inRange('created_at')} GROUP BY status`, dates),
    pool.query(`SELECT currency, COALESCE(SUM(total_snapshot), 0) total_snapshot FROM cart_history WHERE ${inRange('created_at')} GROUP BY currency ORDER BY currency NULLS LAST`, dates),
    pool.query(`SELECT id, order_number, status, created_at FROM cart_history WHERE ${inRange('created_at')} ORDER BY created_at DESC LIMIT 10`, dates),
    pool.query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE ${inRange('created_at')}) new FROM profiles`, dates),
    pool.query(`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE is_read = false) unread FROM contact_submissions WHERE ${inRange('created_at')}`, dates),
    pool.query(`SELECT id, name, created_at FROM contact_submissions WHERE ${inRange('created_at')} ORDER BY created_at DESC LIMIT 10`, dates),
    pool.query(`SELECT status, COUNT(*) count FROM academy_registrations WHERE ${inRange('created_at')} GROUP BY status`, dates),
    pool.query(`SELECT experience_level, COUNT(*) count FROM academy_registrations WHERE ${inRange('created_at')} GROUP BY experience_level`, dates),
    pool.query(`SELECT COALESCE(SUM(view_count), 0) total FROM product_view_daily WHERE ${inRange('viewed_on')}`, dates),
    pool.query(`SELECT p.id, p.name, COALESCE(SUM(v.view_count) FILTER (WHERE ${inRange('v.viewed_on')}), 0) views FROM products p LEFT JOIN product_view_daily v ON v.product_id = p.id GROUP BY p.id, p.name ORDER BY views DESC, p.name ASC LIMIT 10`, dates),
  ]);
  const p = products.rows[0] as Record<string, unknown>; const c = carts.rows[0] as Record<string, unknown>; const u = users.rows[0] as Record<string, unknown>; const contact = contacts.rows[0] as Record<string, unknown>;
  const quoteByStatus = statusCounts(quoteStatuses.rows as Record<string, unknown>[]); const cartByStatus = statusCounts(cartStatuses.rows as Record<string, unknown>[]); const academyByStatus = statusCounts(academyStatuses.rows as Record<string, unknown>[]); const academyByExperienceLevel = statusCounts(academyExperience.rows as Record<string, unknown>[], 'experience_level');
  return { products: { total: n(p.total), published: n(p.published), draft: n(p.draft), featured: n(p.featured), hero: n(p.hero), totalViews: n((views.rows[0] as Record<string, unknown>).total), topProducts: (topProducts.rows as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name), views: n(r.views) })) }, quotes: { total: sum(quoteByStatus), byStatus: quoteByStatus, totalValue: n((quoteValue.rows[0] as Record<string, unknown>).total), recent: (recentQuotes.rows as Record<string, unknown>[]).map((r) => ({ id: String(r.id), referenceNumber: String(r.reference_number), status: String(r.status), createdAt: (r.created_at as Date).toISOString() })) }, carts: { total: n(c.total), active: n(c.active), submitted: cartByStatus['submitted'] ?? 0, byStatus: cartByStatus, totalValueByCurrency: (cartValue.rows as Record<string, unknown>[]).map((row) => ({ currency: (row['currency'] as string | null) ?? null, totalSnapshot: n(row['total_snapshot']) })), recent: (recentCarts.rows as Record<string, unknown>[]).map((r) => ({ id: String(r.id), orderNumber: (r.order_number as string | null) ?? null, status: String(r.status), createdAt: (r.created_at as Date).toISOString() })) }, users: { total: n(u.total), new: n(u.new) }, contacts: { total: n(contact.total), unread: n(contact.unread), recent: (recentContacts.rows as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name), createdAt: (r.created_at as Date).toISOString() })) }, academy: { total: sum(academyByStatus), byStatus: academyByStatus, byExperienceLevel: academyByExperienceLevel } };
}
