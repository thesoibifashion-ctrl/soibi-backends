# Signature By Sarah Backend API

## Overview

The Signature By Sarah (SBS) Backend API powers the Signature By Sarah ecommerce platform. It provides product discovery and management, quotes, customer carts and favorites, contact and academy forms, gallery content, and role-protected administration endpoints.

The application is built with:

- Node.js and Express
- TypeScript with strict type checking
- PostgreSQL hosted by Pxxl Managed PostgreSQL
- Backend-owned authentication with bcrypt password hashing and signed JWTs
- A layered REST API architecture: routes, controllers, services, repositories, validators, and middleware
- Resend for transactional email notifications

All API responses use a consistent JSON envelope with `success`, `message`, and `data` fields.

---

## Features

- Backend-owned customer, admin, and super-admin accounts and profiles
- Google OAuth sign-in alongside email/password authentication
- Customer, admin, and super-admin roles
- Public product, collection, material, color, carousel, and customization catalog APIs
- Admin product management, images, variants, and collection assignments
- Public gallery with admin gallery management
- Guest and authenticated quote submission with contact preference and email notifications
- Contact submissions and admin review
- SBS Academy registrations and admin review
- Authenticated customer carts with price snapshots, submission lifecycle, and cart history
- Authenticated product favorites
- Internal email notifications to Signature By Sarah on every quote and cart submission

---

## Setup

### Requirements

- Node.js 18 or later
- A Pxxl Managed PostgreSQL database (or another standard PostgreSQL instance for local development)
- A Resend account for email notifications

### Installation

```bash
npm install
```

Create a `.env` file with the variables described below, then start the development server:

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Database migrations

Apply every SQL file in `src/database/migrations` in numeric order to a new PostgreSQL database with:

```bash
npm run db:migrate
```

The command uses the existing `DATABASE_URL`, runs migrations from `001` through the latest file in numeric filename order, and stops immediately if any migration fails. It does not keep a migration-history table, so use it once for a clean Pxxl database; do not re-run it against a database where these SQL files have already been applied. The initial migration creates the backend-owned `profiles` account table; later migrations extend the ecommerce schema. A pre-existing database created from the former external-auth schema needs a separately planned account/data migration before using these revised files:

- `008_one_pending_draft_per_customer.sql` — adds the partial unique index that enforces one active draft per authenticated customer at the database level.
- `009_cart_overhaul.sql` — replaces the guest-session cart design with a status-based authenticated cart. Adds `status` (`active`, `submitted`, `abandoned`) to `carts`, a partial unique index enforcing one active cart per profile, snapshot columns on `cart_items` (`product_name_snapshot`, `image_url_snapshot`, `selected_color`, `selected_material`, `selected_size`), makes `cart_items.product_id` nullable, and creates the `cart_history` table.
- `010_quote_contact_method.sql` — adds `contact_method` (`email`, `whatsapp`) to `quote_requests` so the customer's preferred contact channel is stored alongside the quote.
- `016_google_oauth_profiles.sql` — allows passwordless Google-only accounts and stores Google’s immutable subject identifier.

### Production

```bash
npm start
```

`npm start` runs the compiled server at `dist/server.js`.

---

## Environment Variables

All variables below are required by the current runtime configuration unless a default is noted.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No (defaults to `5000`) | HTTP port used by Express. Development is currently configured to use `5001`. |
| `NODE_ENV` | No (defaults to `development`) | Application environment; enables production database SSL behavior when set to `production`. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `JWT_SECRET` | Yes | Application JWT configuration value. |
| `JWT_EXPIRES_IN` | No (defaults to `7d`) | Application JWT expiry configuration. |
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 web-client ID from Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 web-client secret from Google Cloud. Keep secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Exact Google callback URL, for example `http://localhost:5001/api/auth/google/callback`. |
| `GOOGLE_OAUTH_STATE_SECRET` | Yes | A separate random secret used to sign the short-lived OAuth state cookie. |
| `FRONTEND_URL` | Yes | Allowed CORS origin and base URL for customer tracking links. |
| `ADMIN_URL` | Yes | Base URL used for admin dashboard links in notification emails. |
| `LIVE_URL` | Yes | Additional allowed CORS origin. |
| `RESEND_API_KEY` | Yes | Resend API key used to send transactional notifications. |
| `RESEND_FROM_EMAIL` | Yes | A `Display Name <address@verified-domain>` sender accepted by Resend. |
| `NOTIFICATION_EMAIL` | No (defaults to `signaturebysarah1@gmail.com`) | Recipient address for all internal order and quote notifications. |

Example:

```env
PORT=5001
NODE_ENV=development
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5001/api/auth/google/callback
GOOGLE_OAUTH_STATE_SECRET=...
FRONTEND_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001
LIVE_URL=http://localhost:3000
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Signature By Sarah <orders@example.com>"
NOTIFICATION_EMAIL=signaturebysarah1@gmail.com
```

---

## Authentication

Authentication is owned by this backend. Passwords are hashed with `bcryptjs` before storage, and the API signs HS256 JWT access tokens using `JWT_SECRET`. The token subject is the `profiles.id`; every protected request resolves that profile from PostgreSQL, so role and active-account checks are current.

Protected requests must include:

```http
Authorization: Bearer <access_token>
```

Roles are:

| Role | Access |
| --- | --- |
| `customer` | Own profile, cart, favorites, and quote history. |
| `admin` | Customer access plus all `/api/admin/*` endpoints. |
| `super_admin` | Same administrative endpoint access as `admin`. |

`POST /api/auth/register` creates a customer account and returns an access token. `POST /api/auth/login` returns an access token for an existing account. `GET /api/auth/me` returns the authenticated profile. Registrations always receive the `customer` role; provision the first administrator directly in PostgreSQL through an approved operational process. Password-reset, refresh-token, email-verification, and Cloudinary upload flows are not implemented in this backend.

### Google OAuth setup

Google Sign-In is an additional authentication method; email/password registration and login continue to work unchanged. Start the browser flow at `GET /api/auth/google`. Google redirects to `GET /api/auth/google/callback`, which returns the same JWT session response as `POST /api/auth/login`. The frontend must retain that Bearer token in the same way it handles an email/password login. There is no server-side application session to revoke: logout means the client discards its JWT.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, configure the OAuth consent screen, then create an **OAuth 2.0 Client ID** for a **Web application**.
2. Copy its client ID and client secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; never commit either value.
3. Add the exact `GOOGLE_OAUTH_REDIRECT_URI` to that client’s **Authorized redirect URIs**. Google requires an exact match, including protocol, host, port, path, and trailing slash behavior. For local development use `http://localhost:5001/api/auth/google/callback`. For Pxxl use the public HTTPS API URL, for example `https://api.example.com/api/auth/google/callback`.
4. Generate a separate high-entropy value for `GOOGLE_OAUTH_STATE_SECRET`. The backend uses it only to sign a ten-minute, HTTP-only OAuth state cookie and clears that cookie at the callback.
5. Apply `016_google_oauth_profiles.sql` once through the Pxxl SQL console or your normal migration process before using Google Sign-In. Do not rerun migrations `001`–`015` on an already-migrated database.

The implementation uses Google’s authorization-code flow with `openid email profile` scopes and accepts only Google accounts whose email is verified. A profile is found by Google subject first, then an existing matching SBS email account is linked; otherwise a new customer profile is created. See Google’s [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [OpenID Connect reference](https://developers.google.com/identity/openid-connect/reference) for Cloud configuration details.

---

## Email Notifications

After every successful quote submission and cart submission, the backend sends settings-controlled HTML notifications to Signature By Sarah and to the customer when the respective notification setting is enabled. The customer email is sent to `guestEmail` for guest quotes, to the authenticated account email for customer quotes, and to the authenticated account email for cart submissions.

Customer emails include the customer name, order/reference number, status, item details, available total, and a tracking link built from `FRONTEND_URL`: `/tracking/quote/:orderNumber` for quotes and `/tracking/cart/:orderNumber` for cart orders. Internal emails retain the customer/contact details, order details, and exact admin dashboard link built from `ADMIN_URL`.

Emails are sent through Resend using `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` sender. Resend API rejections are logged with recipient and error details. Delivery failures do not affect the API response or roll back an already committed submission.

The branded email template is defined in `src/utils/emailBrand.ts` (shared constants and layout helpers), `src/utils/cartSubmissionEmail.ts` (cart-specific template), and `src/utils/quoteSubmissionEmail.ts` (quote-specific template).

To replace the logo, update the `logoUrl` constant in `src/utils/emailBrand.ts`.

---

# API Documentation

Base URL examples below assume `http://localhost:5001`.

Authentication labels:

- **Public** — no token required.
- **Customer token** — any valid authenticated SBS user token.
- **Admin/Super Admin token** — valid authenticated token with `admin` or `super_admin` role.

## Health

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/` | Public | Simple server availability response. |
| `GET` | `/api/health` | Public | Health check for local tooling and deployment platforms. |

## Authentication

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Creates a customer account from `email`, `password` (minimum 12 characters), and `fullName`; returns a Bearer access token. |
| `POST` | `/api/auth/login` | Public | Signs in with `email` and `password`; returns a Bearer access token. |
| `GET` | `/api/auth/google` | Public | Starts the Google OAuth authorization-code flow. |
| `GET` | `/api/auth/google/callback` | Public | Validates the OAuth callback and returns the standard Bearer JWT session response. |
| `GET` | `/api/auth/me` | Customer token | Returns the authenticated SBS profile, including role. |

## Products

### Public catalog

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/products` | Public | Lists published, non-deleted products. Supports `collection`, `color`, `category`, `gender`, `size`, `material`, and `sort` filters. |
| `GET` | `/api/products/featured` | Public | Lists published featured products. |
| `GET` | `/api/products/hero` | Public | Lists published hero products. |
| `GET` | `/api/products/:slug` | Public | Returns one published product with `colors`, `materials`, and `sizes` catalog arrays. |

### Admin product management

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/admin/products` | Admin/Super Admin token | Lists every non-deleted product for administration, including draft, published, and archived products. It does not apply public published-only visibility restrictions. Each product includes images, collections, materials, colors, and sizes. |
| `POST` | `/api/admin/products` | Admin/Super Admin token | Creates a product. |
| `PATCH` | `/api/admin/products/:id` | Admin/Super Admin token | Partially updates an active product. |
| `DELETE` | `/api/admin/products/:id` | Admin/Super Admin token | Soft-deletes a product by setting `deleted_at`. |
| `POST` | `/api/admin/products/:id/images` | Admin/Super Admin token | Stores image metadata; does not upload a file. |
| `DELETE` | `/api/admin/products/:id/images/:imageId` | Admin/Super Admin token | Removes one image metadata record. |
| `POST` | `/api/admin/products/:id/collections` | Admin/Super Admin token | Assigns a product to a collection. Duplicate assignments are rejected. |
| `DELETE` | `/api/admin/products/:id/collections/:collectionId` | Admin/Super Admin token | Removes only the product-to-collection relationship. |
| `POST` | `/api/admin/products/:id/variants` | Admin/Super Admin token | Adds a product variant. |
| `PATCH` | `/api/admin/products/:id/variants/:variantId` | Admin/Super Admin token | Partially updates a product variant. |
| `DELETE` | `/api/admin/products/:id/variants/:variantId` | Admin/Super Admin token | Removes a product variant. |

`GET /api/products` remains public and returns only published, non-deleted products. `GET /api/admin/products` is protected for `admin` and `super_admin` and returns all non-deleted catalogue records. Its response is `{ "success": true, "message": "Products retrieved", "data": [...] }`; every product record includes its administrative fields plus `images`, `collections`, `materials`, `colors`, and `sizes` arrays.

Create a product:

```json
{
  "name": "Classic Leather Loafer",
  "slug": "classic-leather-loafer",
  "description": "Handcrafted leather loafer.",
  "category": "Shoes",
  "basePrice": 85000,
  "isCustomizable": true,
  "status": "draft",
  "isFeatured": false,
  "isHero": false,
  "colors": [
    { "name": "Brown", "hex": "#8B4513" },
    { "name": "Black", "hex": "#000000" }
  ],
  "materials": [
    { "name": "Full Grain Leather" }
  ],
  "sizes": [40, 41, 42]
}
```

`category` is an optional free-form label (for example, `Shoes`, `Bags`, `Belts`, `Wallets`, or `Accessories`) and is separate from collections. `status` is one of `draft`, `published`, or `archived`. Product updates accept any non-empty subset of the same fields, including `category`.

`gender` is optional and can be `male`, `female`, or `unisex`. Valid product sort values are `newest`, `price_asc`, `price_desc`, `size_asc`, `size_desc`, and `collection_sort`. `size_asc` and `size_desc` order products by their minimum and maximum assigned size respectively; products with no sizes sort last. `collection_sort` orders products by their `sort_order` within the filtered collection. Color filtering uses an exact hex code (for example `%23111111`); `collection` and `material` use their slugs (for example `mens-shoes` and `full-grain-leather`); `size` uses the numeric size value. Material objects in product and material responses include `id`, `name`, and `slug`.

`colors`, `materials`, and `sizes` are optional create/update fields. Supplying one replaces that product's corresponding availability list in the same transaction. The API creates or reuses the necessary catalog records; no prior catalog request is needed. Sizes are stored through `sizes` and `product_sizes`, independently of legacy product variants. All product list and detail responses include `colors`, `materials`, and `sizes`; color objects expose both `hex` and `hexCode`.

Add image metadata:

```json
{
  "imageUrl": "https://images.example.com/loafer.jpg",
  "imagePublicId": "products/loafer-main",
  "altText": "Classic leather loafer",
  "sortOrder": 0,
  "isPrimary": true
}
```

Assign a collection:

```json
{ "collectionId": "00000000-0000-0000-0000-000000000000" }
```

Create or update a variant. All fields are optional for creation because database defaults apply; update requests must include at least one field.

```json
{
  "sizeLabel": "42",
  "sizeValue": 42,
  "sku": "SBS-LOAFER-42-BROWN",
  "priceAdjustment": 5000,
  "colorId": "00000000-0000-0000-0000-000000000000",
  "isAvailable": true,
  "sortOrder": 0
}
```

## Collections

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/collections` | Public | Lists published collections; use `?featured=true` for homepage collections. |
| `GET` | `/api/collections/:slug` | Public | Returns a published collection and its published products. |
| `GET` | `/api/admin/collections` | Admin/Super Admin token | Lists all collections, including drafts and archived collections. |
| `POST` | `/api/admin/collections` | Admin/Super Admin token | Creates a collection. |
| `PATCH` | `/api/admin/collections/:id` | Admin/Super Admin token | Partially updates a collection. |
| `DELETE` | `/api/admin/collections/:id` | Admin/Super Admin token | Deletes a collection. |

Create a collection:

```json
{
  "name": "Men's Shoes",
  "slug": "mens-shoes",
  "description": "Handcrafted shoes for men.",
  "imageUrl": "https://images.example.com/mens-shoes.jpg",
  "imagePublicId": "collections/mens-shoes",
  "status": "draft",
  "isFeatured": false,
  "sortOrder": 0
}
```

Updates accept any non-empty subset of these fields.

## Homepage carousel

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/home/carousel` | Public | Lists active carousel slides by `sortOrder`. |
| `GET` | `/api/admin/home/carousel` | Admin/Super Admin token | Lists all carousel slides, including inactive ones. |
| `POST` | `/api/admin/home/carousel` | Admin/Super Admin token | Creates a carousel slide. |
| `PATCH` | `/api/admin/home/carousel/:id` | Admin/Super Admin token | Updates a carousel slide. |
| `DELETE` | `/api/admin/home/carousel/:id` | Admin/Super Admin token | Deletes a carousel slide. |

Carousel create body:

```json
{
  "imageUrl": "https://images.example.com/home-slide.jpg",
  "imagePublicId": "homepage/slide-01",
  "sortOrder": 0,
  "isActive": true
}
```

## Custom order builder

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/customizations` | Public | Returns active customization categories with active options. |
| `GET` | `/api/admin/customizations` | Admin/Super Admin token | Returns all categories and options, including inactive items. |
| `POST` | `/api/admin/customizations/categories` | Admin/Super Admin token | Creates a category. |
| `PATCH` | `/api/admin/customizations/categories/:id` | Admin/Super Admin token | Updates a category. |
| `DELETE` | `/api/admin/customizations/categories/:id` | Admin/Super Admin token | Deletes a category and its options. |
| `POST` | `/api/admin/customizations/options` | Admin/Super Admin token | Creates an option. |
| `PATCH` | `/api/admin/customizations/options/:id` | Admin/Super Admin token | Updates an option. |
| `DELETE` | `/api/admin/customizations/options/:id` | Admin/Super Admin token | Deletes an option. |

Categories and options use a reusable `active`/`inactive` status and `sortOrder`. The migration seeds Shoe Types with the requested styles and creates empty Materials, Soles, and Colours categories for the admin to populate.

## Materials and Colors

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/materials` | Public | Lists active materials. |
| `GET` | `/api/colors` | Public | Lists active colors. |

Material responses include `id`, `name`, `slug`, `description`, and `imageUrl`. The stable `slug` is the value accepted by `GET /api/products?material=...`.

## Gallery

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/gallery` | Public | Lists published gallery images. |
| `POST` | `/api/admin/gallery` | Admin/Super Admin token | Stores gallery image metadata; does not upload a file. |
| `DELETE` | `/api/admin/gallery/:id` | Admin/Super Admin token | Deletes a gallery image record. |

Create gallery metadata:

```json
{
  "title": "Workshop craftsmanship",
  "imageUrl": "https://images.example.com/workshop.jpg",
  "imagePublicId": "gallery/workshop-01",
  "category": "workshop",
  "sortOrder": 0,
  "isPublished": true
}
```

`category` must be `workshop`, `craftsmanship`, or `completed_work`.

## Contact

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `POST` | `/api/contact` | Public | Submits a contact-form message. |
| `GET` | `/api/admin/contact` | Admin/Super Admin token | Returns all contact submissions, newest first. |
| `GET` | `/api/admin/contact/:id` | Admin/Super Admin token | Returns one contact submission. |

Submit a contact form:

```json
{
  "name": "Ada Okafor",
  "email": "ada@example.com",
  "phone": "+2348012345678",
  "subject": "Custom shoes enquiry",
  "message": "I would like to discuss a custom order."
}
```

`name`, `email`, and `message` are required. `phone` and `subject` are optional.

## Academy Applications

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `POST` | `/api/academy/register` | Public | Submits an SBS Academy application. |
| `GET` | `/api/admin/academy/applications` | Admin/Super Admin token | Returns all applications, newest first. |
| `GET` | `/api/admin/academy/applications/:id` | Admin/Super Admin token | Returns one application. |

Submit an application:

```json
{
  "fullName": "Ada Okafor",
  "email": "ada@example.com",
  "phone": "+2348012345678",
  "country": "Nigeria",
  "experienceLevel": "beginner",
  "motivation": "I want to learn leather craftsmanship."
}
```

`fullName`, `email`, and `phone` are required. `experienceLevel` may be `beginner`, `intermediate`, or `advanced`.

## Quotes

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `POST` | `/api/quotes` | Public; customer token optional | Submits a guest or authenticated quote. Guests must provide `guestName` and `guestEmail`. |
| `GET` | `/api/quotes/my` | Customer token | Lists only the authenticated customer's quote history. |
| `GET` | `/api/quotes/:id` | Customer token | Returns one quote owned by the authenticated customer, including items and status history. |
| `PATCH` | `/api/quotes/:id` | Customer token | Updates an owned, still-pending customer quote. |
| `GET` | `/api/admin/quotes` | Admin/Super Admin token | Lists all quotes. An optional `?status=` filter is supported. |
| `GET` | `/api/admin/quotes/:id` | Admin/Super Admin token | Returns one quote with customer details, items, and status history. |
| `PATCH` | `/api/admin/quotes/:id/status` | Admin/Super Admin token | Updates quote status and writes a history entry. |

### Contact preference

Every quote submission — guest or authenticated — records how the customer wants to be contacted. The frontend collects this choice and sends it with the request.

Authenticated quote with email contact:

```json
{
  "contactMethod": "email",
  "customerNotes": "Please contact me with available options.",
  "items": []
}
```

Authenticated quote with WhatsApp contact:

```json
{
  "contactMethod": "whatsapp",
  "phoneNumber": "+2348012345678",
  "customerNotes": "Please contact me with available options.",
  "items": []
}
```

`contactMethod` is `email` or `whatsapp`. When `whatsapp` is selected:

- If `phoneNumber` is provided, it is saved to the authenticated customer's profile for future use.
- If `phoneNumber` is omitted, the phone number already saved on the profile is used.
- If `whatsapp` is selected and no phone number exists anywhere, the request is rejected with a `400` error.

For guest quotes, `contactMethod` is not required. The guest's phone is taken from `guestPhone`.

### Submit a guest quote

```json
{
  "guestName": "Ada Okafor",
  "guestEmail": "ada@example.com",
  "guestPhone": "+2348012345678",
  "customerNotes": "Please contact me with available options.",
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000000",
      "productName": "Classic Leather Loafer",
      "imageUrlSnapshot": "https://images.example.com/loafer.jpg",
      "shoeNameSnapshot": "Classic Loafer",
      "toeStyleSnapshot": "Round toe",
      "size": 42,
      "material": "Full Grain Leather",
      "color": "Brown",
      "quantity": 1,
      "unitPriceSnapshot": 85000,
      "customMeasurements": { "footLength": 27 },
      "customNotes": "Slightly wider fit."
    }
  ]
}
```

`guestName`, `guestEmail`, and `guestPhone` are used as the contact details in the internal notification email sent to Signature By Sarah.

### Quote item fields

All snapshot and customisation fields are optional and nullable: `productNameSnapshot`, `variantLabelSnapshot`, `materialNameSnapshot`, `colorNameSnapshot`, `imageUrlSnapshot`, `shoeNameSnapshot`, `toeStyleSnapshot`, `size`, `customMeasurements`, `customNotes`, and `unitPriceSnapshot`. This allows a customer to save a partially configured item. When a value is supplied it is stored as an immutable snapshot; omitted or `null` values are stored as `null`, not placeholder strings. `productId` is also nullable — a fully custom shoe that does not correspond to any product record can be quoted by omitting or setting `productId` to `null`. Legacy `productName`, `material`, and `color` input aliases remain supported for compatibility.

### Quote lifecycle fields

Quotes have two independent lifecycle fields:

| Field | Controlled by | Values | Purpose |
| --- | --- | --- | --- |
| `customerStatus` | Customer | `pending`, `completed` | Tracks whether the customer has finished building and submitted their draft. |
| `status` | Admin | `pending`, `reviewing`, `approved`, `completed`, `cancelled` | Admin review workflow. Independent of `customerStatus`. |

Setting `customerStatus = completed` does not change the admin `status`. The admin workflow begins after the customer submits.

### Active quote draft lifecycle

Authenticated customers have one active draft at a time:

```
Customer calls POST /api/quotes
  ↓
If a pending draft exists → merge items/notes into it (no new record)
If no pending draft exists → create a new quote with customerStatus = pending
  ↓
Customer calls PATCH /api/quotes/:id to add, remove, or update items
  ↓
Customer sets customerStatus = completed to submit the draft
  ↓
Completed quote enters history — cannot be edited
  ↓
Customer may now create a new pending draft
```

This is enforced at both the application layer and the database layer via a partial unique index on `(profile_id) WHERE customer_status = 'pending'`.

### Nullable productId

`productId` on a quote item is optional and nullable. A customer building a fully custom shoe — with custom measurements, materials, and notes but no matching product in the catalogue — can submit a quote item with `productId: null`. The snapshot fields capture all relevant details.

### Update a customer quote

```json
{
  "customerNotes": "Please use the darker leather.",
  "customerStatus": "completed",
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000000",
      "productNameSnapshot": "Classic Leather Loafer",
      "imageUrlSnapshot": "https://images.example.com/loafer.jpg",
      "shoeNameSnapshot": "Classic Loafer",
      "toeStyleSnapshot": "Round toe",
      "quantity": 2,
      "unitPriceSnapshot": 85000
    }
  ]
}
```

All fields are optional, but at least one must be supplied. When `items` is supplied it replaces the quote's item list. Admin-only fields, including admin notes and the admin workflow status, are not accepted.

A draft item can be created or updated before customisation is complete:

```json
{
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000000",
      "quantity": 1,
      "productNameSnapshot": null,
      "imageUrlSnapshot": null,
      "unitPriceSnapshot": null
    }
  ]
}
```

### Update quote status (admin)

```json
{
  "status": "reviewing",
  "note": "Measurements are being reviewed."
}
```

Valid admin status transitions:

| From | To |
| --- | --- |
| `pending` | `reviewing`, `cancelled` |
| `reviewing` | `approved`, `cancelled` |
| `approved` | `completed`, `cancelled` |
| `completed` | — |
| `cancelled` | — |

### Quote email notification

After every quote submission — guest or authenticated — the existing internal notification email is sent to Signature By Sarah, and the customer confirmation email is sent when `notify_customer_on_quote` is enabled. The customer email includes the quote reference, current status, submitted items, available estimated total, and a `FRONTEND_URL/tracking/quote/:orderNumber` link. The internal email includes:

- Customer name, email, phone, and preferred contact method
- Quote reference number and status
- Submission date
- Customer notes
- All quote items with snapshots
- Estimated total (when prices are available)
- A link to the admin quotes panel

The email is fire-and-forget. If it fails, the quote submission is unaffected.

## Cart

Cart endpoints are authenticated-only. Each authenticated profile has one active cart at a time. Cart items store complete snapshots of the product name, image, price, size, color, and material at the time of adding — the cart display never depends on live product data. When the same product and option combination is added again, the quantity increases instead of creating a duplicate row.

### Cart status lifecycle

The `carts` table has a `status` field that tracks where the cart is in its lifecycle:

| Status | Meaning |
| --- | --- |
| `active` | The cart the customer is currently building. Only one active cart per profile is allowed at a time, enforced by a partial unique index at the database level. |
| `submitted` | The cart has been submitted by the customer. It is read-only and preserved for history. |
| `abandoned` | Reserved for future use (for example, carts that expire without being submitted). |

### Cart item snapshots

Each `cart_items` row stores the complete state of the item at the time it was added:

- `product_name_snapshot` — the product name as it appeared when added
- `image_url_snapshot` — the product image URL at time of adding
- `unit_price_snapshot` — the price at time of adding
- `selected_color`, `selected_material`, `selected_size` — the customer's chosen options

These snapshots are the source of truth for displaying the cart. If a product is later renamed, repriced, or deleted, the cart item still shows what the customer originally selected. `product_id` is nullable to support fully custom items with no catalogue record.

### Endpoints

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/cart` | Customer token | Returns the active cart with all items. Creates an empty active cart if none exists. |
| `POST` | `/api/cart/items` | Customer token | Adds an item to the active cart, or increases quantity if the same combination already exists. |
| `PATCH` | `/api/cart/items/:id` | Customer token | Updates quantity, size, color, or material on an owned active cart item. At least one field required. |
| `DELETE` | `/api/cart/items/:id` | Customer token | Removes one item from the active cart. |
| `DELETE` | `/api/cart` | Customer token | Clears all items from the active cart. |
| `POST` | `/api/cart/submit` | Customer token | Submits the active cart: records contact preference, snapshots items to history, marks cart submitted, and creates a new empty active cart. |
| `GET` | `/api/cart/history` | Customer token | Returns all previously submitted cart snapshots for the authenticated profile, newest first. |

### Add an item

The frontend sends the complete item snapshot. The backend does not look up product details to populate the cart.

```json
{
  "productId": "00000000-0000-0000-0000-000000000000",
  "productNameSnapshot": "Classic Leather Loafer",
  "imageUrlSnapshot": "https://images.example.com/loafer.jpg",
  "quantity": 1,
  "selectedSize": 42,
  "selectedColor": "Brown",
  "selectedMaterial": "Full Grain Leather",
  "unitPriceSnapshot": 85000
}
```

`productId` is optional and nullable. All snapshot fields except `quantity` and `unitPriceSnapshot` are optional. Duplicate detection matches on `productId`, `selectedSize`, `selectedColor`, and `selectedMaterial`; a match increases quantity instead of inserting a new row.

### Update a cart item

At least one field must be provided.

```json
{
  "quantity": 2,
  "selectedSize": 43,
  "selectedColor": "Black",
  "selectedMaterial": "Suede"
}
```

### Submit the cart

The frontend sends the customer's contact preference with the submission request.

Submit with email contact:

```json
{
  "contactMethod": "email"
}
```

Submit with WhatsApp contact and a new phone number:

```json
{
  "contactMethod": "whatsapp",
  "phoneNumber": "+2348012345678"
}
```

Submit with WhatsApp using the phone number already saved on the profile:

```json
{
  "contactMethod": "whatsapp"
}
```

`contactMethod` is required. `phoneNumber` is optional. When `whatsapp` is selected and `phoneNumber` is provided, the number is saved to the customer's profile for future submissions. When `whatsapp` is selected and no `phoneNumber` is provided, the phone already saved on the profile is used. If no phone exists anywhere, the request is rejected with a `400` error.

Response:

```json
{
  "success": true,
  "message": "Cart submitted successfully",
  "data": {
    "submittedCartId": "00000000-0000-0000-0000-000000000000",
    "historyId": "00000000-0000-0000-0000-000000000001",
    "newActiveCartId": "00000000-0000-0000-0000-000000000002"
  }
}
```

Possible errors:

| Status | Condition |
| --- | --- |
| `400 Bad Request` | `contactMethod` missing or invalid, or `whatsapp` selected with no phone number available. |
| `401 Unauthorized` | No valid token provided. |
| `404 Not Found` | The authenticated profile has no active cart. |

The entire submission runs in a single database transaction. The active cart row is locked at the start to prevent concurrent submissions. If any step fails, the transaction rolls back and the cart remains active and unchanged.

### Cart submission lifecycle

```
Customer adds items → POST /api/cart/items
        ↓
Backend finds or creates active cart
        ↓
Customer updates items → PATCH /api/cart/items/:id
        ↓
Customer submits → POST /api/cart/submit
        ↓
Transaction begins:
  1. Active cart row locked
  2. Profile phone updated if new number provided
  3. All cart items read
  4. Snapshot written to cart_history (items JSONB + total_snapshot)
  5. Cart status: active → submitted
  6. New empty active cart created
Transaction committed
        ↓
Internal notification email sent to Signature By Sarah (fire-and-forget)
        ↓
Customer immediately has a new empty active cart
```

### Cart history

`GET /api/cart/history` returns all submitted carts for the authenticated profile. Each record contains the complete item snapshot as it existed at submission time, the calculated total, and the submission timestamp. This is the foundation for a future "My Orders" view.

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "originalCartId": "00000000-0000-0000-0000-000000000000",
    "profileId": "00000000-0000-0000-0000-000000000003",
    "items": [
      {
        "productId": "00000000-0000-0000-0000-000000000000",
        "productNameSnapshot": "Classic Leather Loafer",
        "imageUrlSnapshot": "https://images.example.com/loafer.jpg",
        "quantity": 1,
        "selectedSize": 42,
        "selectedColor": "Brown",
        "selectedMaterial": "Full Grain Leather",
        "unitPriceSnapshot": 85000
      }
    ],
    "totalSnapshot": 85000,
    "completedAt": "2025-01-01T12:00:00.000Z",
    "createdAt": "2025-01-01T12:00:00.000Z"
  }
]
```

### Cart email notification

After every successful cart submission, the existing internal notification email is sent to Signature By Sarah and the customer confirmation email is sent when `notify_customer_on_cart` is enabled. The customer email includes the order number, current status, cart item snapshots, total, and a `FRONTEND_URL/tracking/cart/:orderNumber` link. The internal email includes the customer's name, email, phone, preferred contact method, all cart items with snapshots, the order total, and an `ADMIN_URL` dashboard link. Delivery is non-blocking and cannot undo the submitted cart.

## Order administration, tracking, payments, and notifications

Apply migrations `011_product_draft_nullable_fields.sql`, `012_order_numbers_payment_settings.sql`, and `013_order_fulfillment_and_cart_item_variant_snapshot.sql` in numeric order before using these endpoints.

All endpoints retain the standard response envelope: `{ "success": true, "message": "...", "data": {} }`.

### Admin cart orders

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/cart/history?customerId=&productId=&status=` | Lists submitted cart orders, with optional filters. |
| `GET` | `/api/admin/cart/history/:id` | Returns one order, including customer details, item snapshot, payment/receipt fields, and status history. |
| `PATCH` | `/api/admin/cart/history/:id/status` | Updates flexible status. Body: `{ "status": "shipped", "note": null }`. |
| `PATCH` | `/api/admin/cart/history/:id/payment` | Updates payment/receipt fields. Body may include `paymentUrl`, `receiptUrl`, and `receiptPublicId`. |
| `PATCH` | `/api/admin/cart/history/:id/fulfillment` | Updates optional `shippingTrackingNumber`, `shippingTrackingUrl`, and `shippingDetails`. |

### Quote and cart payment/receipt endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/admin/quotes/:id/payment` | Admin updates quote payment/receipt fields. |
| `PATCH` | `/api/admin/quotes/:id/fulfillment` | Admin updates quote shipping/tracking data. |
| `PATCH` | `/api/quotes/:id/receipt` | Quote owner stores Cloudinary `receiptUrl` and optional `receiptPublicId`. |
| `GET` | `/api/cart/history/:id` | Cart owner retrieves one submitted order with its status history. |
| `PATCH` | `/api/cart/history/:id/receipt` | Cart owner stores Cloudinary `receiptUrl` and optional `receiptPublicId`. |

Customers never upload files through this backend; receipt URLs/public IDs are supplied after frontend Cloudinary upload.

### Customer tracking

Cart tracking is ownership-checked, so an authenticated customer cannot retrieve another customer's cart order. Quote tracking uses the customer-facing quote reference from the email link and returns only the safe tracking response.

| Method | Endpoint |
| --- | --- |
| `GET` | `/api/tracking/quote/:orderNumber` |
| `GET` | `/api/tracking/cart/:orderNumber` |

Tracking responses include the order number/type, flexible current status, safe status history, dates, complete snapshots, total, payment/receipt fields, and shipping data. They deliberately omit admin notes, customer profile data, and status-change actor data.

### Contact and academy administration

| Method | Endpoint |
| --- | --- |
| `PATCH` | `/api/admin/contact/:id/is-read` |
| `PATCH` | `/api/admin/academy/applications/:id/is-read` |

Both accept `{ "isRead": true }` or `{ "isRead": false }`.

### Settings

Admin and super-admin users can use `GET /api/admin/settings` and `PATCH /api/admin/settings/:key`. `PATCH` accepts `value` (a string, boolean, or `null`) and/or `valueJson`. Notification keys validate booleans; `notification_email` validates email; keys ending in `_url` validate URLs.

Quote, cart, contact, and academy notifications read the existing notification settings. Database writes complete first; Resend failures are logged and do not roll back a submission or status update. Customer emails link to configured `FRONTEND_URL` tracking pages (`/tracking/quote/:orderNumber` and `/tracking/cart/:orderNumber`), and admin emails use configured `ADMIN_URL` dashboard links.

## Favorites

Favorites belong to authenticated profiles. Each profile can favorite a product only once.

| Method | Route | Auth | Purpose / usage |
| --- | --- | --- | --- |
| `GET` | `/api/favorites` | Customer token | Lists the authenticated profile's favorite products with image metadata. |
| `POST` | `/api/favorites/:productId` | Customer token | Adds an active product to favorites. |
| `DELETE` | `/api/favorites/:productId` | Customer token | Removes an owned favorite by product ID. |

Example usage:

```http
POST /api/favorites/00000000-0000-0000-0000-000000000000
Authorization: Bearer <access_token>
```

---

## Quote, cart addresses, receipts, and analytics

Guest quotes remain at `POST /api/quotes`; authenticated customers use `/api/cart`. Cloudinary uploads are performed by the frontend—the API only stores the submitted URLs. `state`, `city`, `address`, `paymentUrl`, and `receiptUrl` are nullable and may be explicitly set to `null`.

```http
POST /api/quotes
Content-Type: application/json

{
  "guestName": "Ada", "guestEmail": "ada@example.com", "items": [],
  "state": "Lagos", "city": "Victoria Island", "address": "12 Example Street",
  "receiptUrl": "https://res.cloudinary.com/example/image/upload/receipt.jpg"
}
```

```http
PATCH /api/cart
Authorization: Bearer <access_token>
Content-Type: application/json

{ "state": "Lagos", "city": "Ikeja", "address": "10 Allen Avenue", "paymentUrl": null, "receiptUrl": null }
```

`PATCH /api/quotes/:id` accepts the address and URL fields for an owned customer quote. Admin quote payment updates use `PATCH /api/admin/quotes/:id/payment`; submitted cart-order payment/address updates use `PATCH /api/admin/cart/history/:id/payment`. Existing receipt routes remain available. All quote statuses are flexible non-empty strings; the established values are `pending`, `reviewing`, `approved`, `completed`, and `cancelled`. Update a status with:

```http
PATCH /api/admin/quotes/:id/status
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{ "status": "reviewing" }
```

`GET /api/admin/analytics?from=2026-01-01&to=2026-08-01` is restricted to `admin` and `super_admin`. It returns product lifecycle and daily-view totals/top products, quote and submitted-cart status/value/recent activity, user totals, contact totals/unread/recent data, and academy status/experience breakdowns. Both dates are optional and use inclusive calendar dates.

Apply `src/database/migrations/015_addresses_analytics_and_product_views.sql` after migrations 001–014. It adds only nullable address/payment columns and the daily product-view aggregate table; no new environment variables are required.

## Deployment

### Pxxl

Deploy the compiled Node.js service to Pxxl and configure the documented runtime variables there. Pxxl provides the managed PostgreSQL database through `DATABASE_URL`; this backend has no external identity-service dependency.

| Setting | Value |
| --- | --- |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `node dist/server.js` |
| Health check path | `GET /api/health` |

Set `NODE_ENV=production`. The server uses SSL for PostgreSQL connections in production.

After deployment, use the configured Pxxl URL as the API base URL and set `FRONTEND_URL`, `ADMIN_URL`, and `LIVE_URL` to the allowed frontend origins for CORS.
