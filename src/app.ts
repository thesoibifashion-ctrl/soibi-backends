import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { corsOptions } from './config/cors.js';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import collectionRoutes from './routes/collection.routes.js';
import materialRoutes from './routes/material.routes.js';
import colorRoutes from './routes/color.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import adminQuoteRoutes from './routes/admin-quote.routes.js';
import contactRoutes from './routes/contact.routes.js';
import academyRoutes from './routes/academy.routes.js';
import adminProductRoutes from './routes/admin-product.routes.js';
import adminCollectionRoutes from './routes/admin-collection.routes.js';
import adminContactRoutes from './routes/admin-contact.routes.js';
import adminAcademyRoutes from './routes/admin-academy.routes.js';
import galleryRoutes from './routes/gallery.routes.js';
import adminGalleryRoutes from './routes/admin-gallery.routes.js';
import cartRoutes from './routes/cart.routes.js';
import favoriteRoutes from './routes/favorite.routes.js';
import homepageRoutes from './routes/homepage.routes.js';
import adminHomepageRoutes from './routes/admin-homepage.routes.js';
import customizationRoutes from './routes/customization.routes.js';
import adminCustomizationRoutes from './routes/admin-customization.routes.js';
import adminSettingsRoutes from './routes/admin-settings.routes.js';
import adminCartRoutes from './routes/admin-cart.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import adminAnalyticsRoutes from './routes/admin-analytics.routes.js';
import adminMeasurementRoutes from './routes/admin-measurement.routes.js';
import currencyRoutes from './routes/currency.routes.js';
import adminCurrencyRoutes from './routes/admin-currency.routes.js';
const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.get("/", (req, res) => {
    res.json({ message: "server works" });
  });
// ─── Parsing ──────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.googleOAuthStateSecret));

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/colors', colorRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/admin/quotes', adminQuoteRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/academy', academyRoutes);
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin/currencies', adminCurrencyRoutes);
app.use('/api/admin/measurements', adminMeasurementRoutes);
app.use('/api/admin/collections', adminCollectionRoutes);
app.use('/api/admin/contact', adminContactRoutes);
app.use('/api/admin/academy', adminAcademyRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/admin/gallery', adminGalleryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/home', homepageRoutes);
app.use('/api/admin/home', adminHomepageRoutes);
app.use('/api/customizations', customizationRoutes);
app.use('/api/admin/customizations', adminCustomizationRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/cart', adminCartRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/tracking', trackingRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
