# Migration Guide: JWT Refresh Token Support

This guide helps you migrate from the old single-token auth system to the new refresh token system.

## For Backend Developers

### 1. Install New Dependencies

```bash
cd backend
npm install
```

This installs `cookie-parser` and its types.

### 2. Update Environment Variables

Add to your `.env` file:

```env
FRONTEND_URL=http://localhost:3000
```

For production, set this to your actual frontend URL (e.g., `https://app.nebgov.io`).

### 3. Run Database Migration

```bash
npm run migrate
```

This creates the `refresh_tokens` table with proper indexes.

### 4. Restart Backend Server

```bash
npm run dev  # Development
# or
npm start    # Production
```

### 5. Verify Migration

Test the new endpoints:

```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"GTEST123..."}' \
  -c cookies.txt

# Refresh (uses cookie from login)
curl -X POST http://localhost:3001/auth/refresh \
  -b cookies.txt \
  -c cookies.txt

# Logout
curl -X POST http://localhost:3001/auth/logout \
  -b cookies.txt
```

## For Frontend Developers

### Breaking Changes

The `/auth/login` endpoint response has changed:

**Old Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": 1,
  "wallet_address": "GTEST..."
}
```

**New Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": 1,
  "wallet_address": "GTEST..."
}
```

### Required Changes

1. **Update Login Call**

```typescript
// Old
const { token } = await response.json();

// New
const { accessToken } = await response.json();
```

2. **Add credentials: 'include' to All Requests**

```typescript
// All fetch calls must include credentials
fetch(url, {
  credentials: "include", // Required for cookies
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

3. **Implement Token Refresh**

Add automatic token refresh on 401 responses:

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

  // If unauthorized, try to refresh
  if (response.status === 401) {
    try {
      const refreshResponse = await fetch("/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (refreshResponse.ok) {
        const { accessToken: newToken } = await refreshResponse.json();
        accessToken = newToken;

        // Retry original request
        response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
          credentials: "include",
        });
      } else {
        // Refresh failed, redirect to login
        window.location.href = "/login";
      }
    } catch (error) {
      window.location.href = "/login";
    }
  }

  return response;
}
```

4. **Update Logout**

```typescript
async function logout() {
  await fetch("/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  // Clear access token from memory
  accessToken = null;

  // Redirect to login
  window.location.href = "/login";
}
```

### Storage Recommendations

**Do NOT store access tokens in localStorage** (vulnerable to XSS attacks).

Instead:

- Store in memory (React state, Zustand, etc.)
- Refresh tokens are automatically stored in httpOnly cookies (secure)

Example with React:

```typescript
function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = async (walletAddress: string) => {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ wallet_address: walletAddress }),
    });

    const { accessToken } = await response.json();
    setAccessToken(accessToken);
  };

  // ... rest of auth logic
}
```

## Backward Compatibility

The new system is **NOT backward compatible** with old tokens. After migration:

1. All existing tokens will be invalid
2. Users must log in again
3. Consider showing a notification: "Please log in again to continue"

## Rollback Plan

If you need to rollback:

1. Revert code changes:

   ```bash
   git revert <commit-hash>
   ```

2. Drop the refresh_tokens table (optional):

   ```sql
   DROP TABLE IF EXISTS refresh_tokens;
   ```

3. Restart backend server

Note: Users will need to log in again after rollback.

## Testing Checklist

- [ ] Backend starts without errors
- [ ] Login returns accessToken and sets cookie
- [ ] API requests work with access token
- [ ] Refresh endpoint returns new access token
- [ ] Logout clears cookie and invalidates token
- [ ] Expired access tokens trigger refresh
- [ ] Expired refresh tokens require re-login
- [ ] CORS allows credentials from frontend origin

## Troubleshooting

### "Refresh token required" error

- Ensure `credentials: 'include'` is set on all fetch calls
- Check browser cookies (should see `refreshToken`)
- Verify CORS configuration allows credentials

### "Invalid or expired token" on API calls

- Access token may have expired (15 min lifetime)
- Implement automatic refresh on 401 responses
- Check token is included in Authorization header

### Cookies not being set

- Verify `FRONTEND_URL` matches your frontend origin
- In production, ensure HTTPS is enabled
- Check browser console for CORS errors

### Tests failing

- Ensure test database is running
- Run migrations on test database
- Set `DATABASE_URL` environment variable

## Support

For issues or questions, refer to:

- `backend/AUTH_IMPLEMENTATION.md` - Complete implementation guide
- `JWT_REFRESH_TOKEN_SUMMARY.md` - Overview of changes
- Backend tests in `backend/src/__tests__/auth.test.ts` - Usage examples
