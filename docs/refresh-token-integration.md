# Refresh token authentication integration

This guide describes the backend contract after migration `027_refresh_tokens.sql` is applied. Frontend work is still required; this change does not modify a frontend application.

## Backend changes and deployment

- Access JWTs remain Bearer tokens signed with `JWT_SECRET`, with the profile UUID in `sub` and the current role in `role`. The default access lifetime is 15 minutes.
- Refresh tokens are 48 random bytes encoded as base64url. PostgreSQL stores only a SHA-256 hash, with a family ID, expiry, revocation timestamp, and replacement link. The default lifetime is 30 days and is renewed on rotation.
- Email-code and Google sign-in both issue the same session contract. The access token is returned in JSON; refresh token is set as an HttpOnly cookie.
- `POST /api/auth/refresh` rotates the cookie token in a transaction. A replayed rotated token revokes the entire token family. Logout revokes that family.
- Auth endpoints have per-process IP limits. Also configure equivalent limits at the gateway when running multiple API instances.

Deployment steps:

1. Set `JWT_SECRET` to a high-entropy secret and set the token lifetimes described below. There is no refresh JWT secret because refresh tokens are opaque random values.
2. Run `npm run db:migrate` before deploying the new application version.
3. Configure `FRONTEND_URL`, `ADMIN_URL`, and `LIVE_URL` to exact browser origins. The existing CORS middleware allows these origins and credentials.
4. For same-site deployments, `REFRESH_COOKIE_SAME_SITE=lax` is appropriate. For a frontend and API on different sites, set `REFRESH_COOKIE_SAME_SITE=none` and serve the API over HTTPS; browsers require `Secure` for `SameSite=None`.
5. Deploy the backend and then update frontend API requests to include credentials on login, refresh, and logout. Use HTTPS in production.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | required | Access JWT signing secret |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRES_IN` | `30d` | Refresh cookie and database lifetime |
| `REFRESH_COOKIE_SAME_SITE` | `lax` | `lax`, `strict`, or `none`; `none` is sent with `Secure` |
| `FRONTEND_URL`, `ADMIN_URL`, `LIVE_URL` | required | CORS allowed origins |

Lifetimes accept a positive integer followed by `s`, `m`, `h`, or `d` (for example, `20m` or `14d`).

## Endpoints

All JSON responses use `{ "success": boolean, "message": string, "data"?: ... , "error"?: {} }`.

### Request email code

`POST /api/auth/request-code`

```json
{ "email": "customer@example.com" }
```

Success returns `200 { "success": true, "message": "Sign-in code sent", "data": {} }`. The one-time code is delivered by email.

### Verify email code and sign in

`POST /api/auth/verify-code`

```json
{ "email": "customer@example.com", "code": "123456" }
```

Success returns `200` with `data` shaped as:

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": { "id": "<uuid>", "email": "customer@example.com", "role": "customer" }
}
```

The user object includes the existing profile fields. The response also sets `refresh_token` as an HttpOnly cookie with `Path=/api/auth`, `Max-Age` matching `REFRESH_TOKEN_EXPIRES_IN`, `SameSite` matching configuration, and `Secure` in production (and whenever SameSite is `none`). JavaScript cannot read the cookie.

Google OAuth (`GET /api/auth/google` and `GET /api/auth/google/callback`) issues the same cookie and JSON session response on successful callback.

### Refresh

`POST /api/auth/refresh` takes no JSON body. Send the `refresh_token` cookie. Success returns the same session JSON shape as sign-in and replaces the cookie with a newly rotated token.

### Logout

`POST /api/auth/logout` takes no JSON body. Send the cookie. The endpoint revokes the refresh token family, clears the cookie using the same path and cookie attributes, and returns `200 { "success": true, "message": "Signed out", "data": {} }`. Logout is idempotent if the cookie is missing.

## Frontend integration

Keep the access token in application memory (for example, an auth context or module state). Do not put it in local storage. The browser stores the refresh token cookie; it is HttpOnly, so frontend JavaScript must never attempt to read it. Use `credentials: 'include'` for calls that establish, refresh, or end the cookie session.

The following fetch client shares one refresh operation among concurrent failed requests, updates the in-memory access token, and retries each original request at most once:

```ts
type User = { id: string; email: string; role: 'customer' | 'admin' | 'super_admin' };
type Session = { accessToken: string; tokenType: 'Bearer'; expiresIn: string; user: User };
type Envelope<T> = { success: true; message: string; data: T };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
let accessToken: string | null = null;
let currentUser: User | null = null;
let refreshInFlight: Promise<boolean> | null = null;

function acceptSession(session: Session) {
  accessToken = session.accessToken;
  currentUser = session.user;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST', credentials: 'include',
      });
      if (!response.ok) {
        accessToken = null;
        currentUser = null;
        return false;
      }
      const body = await response.json() as Envelope<Session>;
      acceptSession(body.data);
      return true;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function apiFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init, headers,
    // Include credentials for all API calls so session endpoints can use cookies.
    credentials: 'include',
  });
  if (response.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    if (await refreshAccessToken()) return apiFetch(path, init, true);
  }
  return response;
}

export async function loginWithEmail(email: string, code: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/auth/verify-code`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const body = await response.json() as Envelope<Session>;
  if (!response.ok) throw new Error(body.message);
  acceptSession(body.data);
  return body.data.user;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } finally {
    accessToken = null;
    currentUser = null;
  }
}
```

The email-code request is a separate `POST /api/auth/request-code` with `{ email }`. For Google sign-in, navigate to `/api/auth/google`; after successful callback, the frontend can call the refresh endpoint to bootstrap its in-memory access token.

### Reload, errors, and authorization

- On page reload, the in-memory access token is gone. Call `POST /api/auth/refresh` with credentials during app startup; on success, store the returned access token and user in memory. On failure, show the signed-out state.
- A `401` from a protected request means its access token is missing, invalid, or expired. Attempt refresh once, then retry that request once. If refresh returns `401` (missing, invalid, expired, revoked, or replayed cookie), clear local auth state and require sign-in. The backend returns the standard error envelope with a clear message.
- `403` means the account is disabled or the user's role is insufficient; do not loop through refresh for it. `429` means the auth endpoint limit was reached; show a retry-later message.
- If concurrent requests fail with `401`, all must await the same `refreshInFlight` promise. Do not start multiple refresh requests: refresh tokens rotate, so a second use of the old cookie is treated as reuse and revokes the token family.
- Use `user.role` to show or hide customer/admin UI. This is only a presentation aid. Protected API operations must continue to rely on backend `requireAuth` and role middleware.

### Cross-origin details

Set `VITE_API_BASE_URL` to the deployed API origin, such as `https://api.example.com`. The backend must allow the exact frontend origin and `Access-Control-Allow-Credentials: true`; wildcard origins cannot be used with credentials. Browser calls that use the cookie need `credentials: 'include'` (or Axios `withCredentials: true`). If the frontend and backend are on different sites, configure `SameSite=None`, HTTPS, and `Secure`; browser third-party-cookie restrictions may still require deploying them under the same site. `SameSite` cookies mitigate cross-site request sending; keep state-changing requests POST and do not relax the origin allowlist.
