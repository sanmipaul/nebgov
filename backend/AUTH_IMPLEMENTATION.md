# JWT Refresh Token Implementation

## Overview

This implementation adds a secure JWT refresh token mechanism to the backend authentication system. Users receive two tokens on login:

- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (7 days), stored in httpOnly cookie

## Architecture

### Token Flow

1. **Login** (`POST /auth/login`)
   - User authenticates with wallet signature
   - Server issues access token (JWT) and refresh token
   - Refresh token stored in database (hashed) and sent as httpOnly cookie
   - Access token returned in response body

2. **API Requests**
   - Client includes access token in `Authorization: Bearer <token>` header
   - Server validates token using existing `authenticate` middleware

3. **Token Refresh** (`POST /auth/refresh`)
   - When access token expires, client calls refresh endpoint
   - Server validates refresh token from cookie
   - Old refresh token invalidated (rotation)
   - New access token and refresh token issued

4. **Logout** (`POST /auth/logout`)
   - Refresh token removed from database
   - Cookie cleared

### Security Features

- **Token Rotation**: Each refresh invalidates the old token and issues a new one
- **httpOnly Cookies**: Refresh tokens stored in httpOnly cookies (not accessible to JavaScript)
- **Token Hashing**: Refresh tokens hashed (SHA-256) before storage
- **Expiry Tracking**: Database tracks token expiration
- **Secure Cookies**: In production, cookies use `secure` flag (HTTPS only)

## Database Schema

```sql
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### POST /auth/login

Authenticate user and issue tokens.

**Request:**

```json
{
  "wallet_address": "GTEST123456789..."
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": 1,
  "wallet_address": "GTEST123456789..."
}
```

**Cookies Set:**

- `refreshToken`: httpOnly, secure (production), sameSite=strict, 7 days

### POST /auth/refresh

Refresh access token using refresh token cookie.

**Request:**

- Requires `refreshToken` cookie

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Cookies Set:**

- New `refreshToken` (old one invalidated)

### POST /auth/logout

Invalidate refresh token and clear cookie.

**Request:**

- Optional `refreshToken` cookie

**Response:**

```json
{
  "message": "Logged out successfully"
}
```

## Configuration

### Environment Variables

Add to `.env`:

```env
JWT_SECRET=your-secret-key-here
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

- `JWT_SECRET`: Secret key for signing JWTs
- `FRONTEND_URL`: Frontend origin for CORS (enables credentials)
- `NODE_ENV`: Set to `production` for secure cookies

### Token Expiry

Configured in `backend/src/routes/auth.ts`:

```typescript
const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days
```

## Client Integration

### Login Flow

```typescript
const response = await fetch("http://localhost:3001/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // Important: include cookies
  body: JSON.stringify({ wallet_address: address }),
});

const { accessToken, user_id } = await response.json();
// Store accessToken in memory or state (not localStorage)
```

### API Requests

```typescript
const response = await fetch("http://localhost:3001/api/endpoint", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  credentials: "include", // Include refresh token cookie
});
```

### Token Refresh

```typescript
async function refreshAccessToken() {
  const response = await fetch("http://localhost:3001/auth/refresh", {
    method: "POST",
    credentials: "include", // Send refresh token cookie
  });

  if (response.ok) {
    const { accessToken } = await response.json();
    return accessToken;
  }

  // Refresh failed, redirect to login
  throw new Error("Session expired");
}
```

### Automatic Refresh

Implement interceptor to automatically refresh on 401:

```typescript
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  if (response.status === 401) {
    // Try to refresh
    accessToken = await refreshAccessToken();

    // Retry original request
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });
  }

  return response;
}
```

### Logout

```typescript
await fetch("http://localhost:3001/auth/logout", {
  method: "POST",
  credentials: "include",
});
// Clear access token from memory
```

## Testing

Run tests:

```bash
npm test -- auth.test.ts
```

Tests cover:

- User creation and login
- Access token generation and validation
- Refresh token rotation
- Token expiry (15 min access, 7 day refresh)
- Logout and token invalidation
- Error cases (invalid tokens, expired tokens, missing tokens)

### Test Requirements

The tests require a PostgreSQL database connection. Ensure you have:

1. A test database running
2. `DATABASE_URL` environment variable set (can be in `.env` file)
3. Database schema applied (run `npm run migrate`)

Example test database setup:

```bash
# Create test database
createdb nebgov_test

# Set environment variable
export DATABASE_URL=postgresql://user:password@localhost:5432/nebgov_test

# Run migrations
npm run migrate

# Run tests
npm test -- auth.test.ts
```

## Migration

To apply the database schema changes:

```bash
npm run migrate
```

Or manually run:

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
```

## Security Considerations

1. **Access Token Storage**: Store in memory/state, not localStorage (XSS protection)
2. **Refresh Token**: httpOnly cookie prevents JavaScript access (XSS protection)
3. **HTTPS**: Always use HTTPS in production for secure cookies
4. **Token Rotation**: Prevents token reuse attacks
5. **CORS**: Configured to allow credentials only from trusted origin
6. **Token Hashing**: Refresh tokens hashed before database storage

## Maintenance

### Cleanup Expired Tokens

Consider adding a cron job to clean up expired tokens:

```sql
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```

### Revoke All User Tokens

To force logout all sessions for a user:

```sql
DELETE FROM refresh_tokens WHERE user_id = $1;
```
