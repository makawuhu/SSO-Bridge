# index.js Step-by-Step Walkthrough

Let's break down your SSO bridge code section by section to understand how it works.

## 1. Imports and Setup

```javascript
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
```

**What's happening:**
- `express`: Web framework for handling HTTP requests
- `axios`: HTTP client for making API calls to Keycloak and AnythingLLM
- `crypto`: Node.js built-in for generating secure random values
- `express.json()`: Middleware to parse JSON request bodies

## 2. Configuration Object

```javascript
const CONFIG = {
  KEYCLOAK_URL: 'https://keycloak.makawuhu.com',
  KEYCLOAK_REALM: 'master',
  KEYCLOAK_CLIENT_ID: 'anythingllm',
  KEYCLOAK_CLIENT_SECRET: 'ccFFHCHRYdMjMrNYyuMi1F6DbDzwQxQE',
  ANYTHINGLLM_URL: 'https://anythingllm.makawuhu.com',
  ANYTHINGLLM_INTERNAL_URL: 'http://192.168.4.7:3001', // Use internal IP for SSO
  ANYTHINGLLM_API_KEY: '1CC3Y73-09X42BB-JDX1QWW-JST30WD',
  BRIDGE_URL: 'https://anythingllm.makawuhu.com',
  PORT: 3000
};
```

**What's happening:**
- Centralized configuration for all endpoints and credentials
- `ANYTHINGLLM_INTERNAL_URL`: Uses internal IP for faster container-to-container communication
- `BRIDGE_URL`: Where this SSO bridge is accessible externally

## 3. State Management

```javascript
const authStates = new Map();

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}
```

**What's happening:**
- `authStates`: In-memory store for OAuth state parameters (CSRF protection)
- `generateState()`: Creates cryptographically secure random strings
- **Why**: Prevents CSRF attacks by ensuring auth callbacks match initiated requests

## 4. User Management Function

```javascript
async function createOrGetUser(keycloakUser) {
  try {
    // First, try to find existing user
    const usersResponse = await axios.get(
      `${CONFIG.ANYTHINGLLM_URL}/api/v1/admin/users`,
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.ANYTHINGLLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Look for existing user by username or email
    const existingUser = usersResponse.data.users.find(
      user => user.username === keycloakUser.preferred_username || 
               user.username === keycloakUser.email
    );

    if (existingUser) {
      console.log(`Found existing user: ${existingUser.username} (ID: ${existingUser.id})`);
      return existingUser;
    }

    // If no existing user, create a new one
    console.log(`Creating new user: ${keycloakUser.preferred_username || keycloakUser.email}`);
    
    const createUserResponse = await axios.post(
      `${CONFIG.ANYTHINGLLM_URL}/api/v1/admin/users/new`,
      {
        username: keycloakUser.preferred_username || keycloakUser.email,
        password: crypto.randomBytes(16).toString('hex'), // Random password (not used)
        role: 'default'
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.ANYTHINGLLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Created new user: ${createUserResponse.data.user.username} (ID: ${createUserResponse.data.user.id})`);
    return createUserResponse.data.user;
  } catch (error) {
    console.error('Error creating/getting user:', error.response?.data || error.message);
    throw error;
  }
}
```

**What's happening:**
1. **Fetch all users** from AnythingLLM using admin API
2. **Search for existing user** by username or email
3. **If found**: Return existing user
4. **If not found**: Create new user with random password
5. **Return the user object** for token generation

**Key Points:**
- Uses AnythingLLM's admin API (requires API key)
- Generates random password (SSO users don't need to know it)
- Assigns 'default' role to new users

## 5. Login Initiation Endpoint

```javascript
app.get('/sso/login', (req, res) => {
  const state = generateState();
  const redirectUri = `${CONFIG.BRIDGE_URL}/sso/callback`;
  
  // Store state with timestamp and redirect info
  authStates.set(state, {
    timestamp: Date.now(),
    redirectTo: req.query.redirectTo || '/'
  });

  // Clean up old states (older than 10 minutes)
  for (const [key, value] of authStates.entries()) {
    if (Date.now() - value.timestamp > 10 * 60 * 1000) {
      authStates.delete(key);
    }
  }

  // Build Keycloak authorization URL
  const keycloakAuthUrl = `${CONFIG.KEYCLOAK_URL}/realms/${CONFIG.KEYCLOAK_REALM}/protocol/openid-connect/auth` +
    `?client_id=${CONFIG.KEYCLOAK_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=openid profile email` +
    `&state=${state}`;

  console.log(`Initiating SSO login with state: ${state}`);
  res.redirect(keycloakAuthUrl);
});
```

**What's happening:**
1. **Generate unique state** for this login attempt
2. **Store state** with timestamp and optional redirect destination
3. **Clean up old states** (prevents memory leaks)
4. **Build Keycloak URL** with all required OAuth2 parameters
5. **Redirect user** to Keycloak for authentication

**OAuth2 Parameters:**
- `client_id`: Identifies this application to Keycloak
- `redirect_uri`: Where Keycloak sends user after auth
- `response_type=code`: OAuth2 authorization code flow
- `scope`: What user info we want (OpenID, profile, email)
- `state`: CSRF protection token

## 6. Callback Handler (The Main Logic)

```javascript
app.get('/sso/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return res.status(400).send(`Authentication failed: ${error}`);
  }

  // Validate required parameters
  if (!code || !state) {
    return res.status(400).send('Missing authorization code or state');
  }

  // Validate state (CSRF protection)
  const storedState = authStates.get(state);
  if (!storedState) {
    return res.status(400).send('Invalid or expired state');
  }

  // Clean up used state
  authStates.delete(state);
```

**What's happening:**
1. **Extract parameters** from Keycloak's callback
2. **Handle OAuth errors** (user denied, etc.)
3. **Validate state parameter** (CSRF protection)
4. **Clean up state** (one-time use)

### Step 6A: Exchange Code for Token

```javascript
  try {
    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      `${CONFIG.KEYCLOAK_URL}/realms/${CONFIG.KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CONFIG.KEYCLOAK_CLIENT_ID,
        client_secret: CONFIG.KEYCLOAK_CLIENT_SECRET,
        code: code,
        redirect_uri: `${CONFIG.BRIDGE_URL}/sso/callback`
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token } = tokenResponse.data;
```

**What's happening:**
1. **POST to Keycloak's token endpoint** with authorization code
2. **Include client credentials** for authentication
3. **Get access token** from response
4. **Uses form-encoded data** (OAuth2 standard)

### Step 6B: Get User Information

```javascript
    // Get user info using access token
    const userInfoResponse = await axios.get(
      `${CONFIG.KEYCLOAK_URL}/realms/${CONFIG.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );

    const keycloakUser = userInfoResponse.data;
    console.log(`Authenticated user: ${keycloakUser.preferred_username || keycloakUser.email}`);
```

**What's happening:**
1. **Call Keycloak's userinfo endpoint** with access token
2. **Extract user details** (username, email, etc.)
3. **Log successful authentication**

### Step 6C: Create/Find User in AnythingLLM

```javascript
    const anythingLLMUser = await createOrGetUser(keycloakUser);
```

**What's happening:**
- **Calls our helper function** to ensure user exists in AnythingLLM
- **Returns user object** with AnythingLLM user ID

### Step 6D: Generate AnythingLLM Auth Token

```javascript
    // Generate auth token and redirect immediately to minimize expiration risk
    console.log(`Generating auth token for user ${anythingLLMUser.id}...`);
    const authToken = await axios.get(
      `${CONFIG.ANYTHINGLLM_URL}/api/v1/users/${anythingLLMUser.id}/issue-auth-token`,
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.ANYTHINGLLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Redirect immediately using internal IP endpoint that works
    const ssoUrl = `${CONFIG.ANYTHINGLLM_INTERNAL_URL}/sso/simple?token=${authToken.data.token}`;
    
    console.log(`SSO completed successfully for user: ${anythingLLMUser.username} (ID: ${anythingLLMUser.id})`);
    console.log(`Redirecting immediately to: ${ssoUrl}`);
    
    res.redirect(ssoUrl);
```

**What's happening:**
1. **Request auth token** from AnythingLLM for the user
2. **Build SSO URL** with the token
3. **Use internal URL** for faster, more reliable connection
4. **Redirect immediately** to minimize token expiration risk

### Step 6E: Error Handling

```javascript
  } catch (error) {
    console.error('SSO callback error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});
```

**What's happening:**
- **Catch any errors** in the OAuth flow
- **Log detailed error** for debugging
- **Return user-friendly error** message

## 7. Health Check and Server Startup

```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    keycloak: CONFIG.KEYCLOAK_URL,
    anythingllm: CONFIG.ANYTHINGLLM_URL
  });
});

app.listen(CONFIG.PORT, () => {
  console.log(`🔐 Keycloak → AnythingLLM SSO Bridge running on port ${CONFIG.PORT}`);
  console.log(`📍 Login URL: ${CONFIG.BRIDGE_URL}/sso/login`);
  console.log(`🔑 Keycloak: ${CONFIG.KEYCLOAK_URL}/realms/${CONFIG.KEYCLOAK_REALM}`);
  console.log(`🤖 AnythingLLM: ${CONFIG.ANYTHINGLLM_URL}`);
  console.log(`⚡ Using internal IP for SSO to minimize token expiration`);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down SSO bridge...');
  process.exit(0);
});
```

**What's happening:**
1. **Health endpoint** for monitoring
2. **Start server** on configured port
3. **Log startup info** for debugging
4. **Handle graceful shutdown** on SIGTERM

## Complete Flow Summary

1. **User clicks login** → `/sso/login`
2. **Generate state** → Store in memory
3. **Redirect to Keycloak** → User authenticates
4. **Keycloak redirects back** → `/sso/callback` with code
5. **Validate state** → CSRF protection
6. **Exchange code for token** → OAuth2 flow
7. **Get user info** → From Keycloak
8. **Create/find user** → In AnythingLLM
9. **Generate auth token** → AnythingLLM token
10. **Redirect with token** → User logged into AnythingLLM

The beauty of this design is that it handles all the OAuth2 complexity while providing a seamless experience for users who just see a single login flow!