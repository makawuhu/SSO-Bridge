const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// FIXED: Now properly supports environment variables with fallbacks
const CONFIG = {
  KEYCLOAK_URL: process.env.KEYCLOAK_URL || 'https://keycloak.makawuhu.com',
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || 'master',
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || 'anythingllm',
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET || 'your client secret',
  ANYTHINGLLM_URL: process.env.ANYTHINGLLM_URL || 'your anythingllm url',
  ANYTHINGLLM_INTERNAL_URL: process.env.ANYTHINGLLM_INTERNAL_URL || 'your local IP',
  ANYTHINGLLM_API_KEY: process.env.ANYTHINGLLM_API_KEY || 'Your AnythingLLM API key',
  // FIXED: Bridge URL should be the SSO bridge domain, not AnythingLLM domain
  BRIDGE_URL: process.env.BRIDGE_URL || 'your bridge url',
  PORT: process.env.PORT || 3000
};

const authStates = new Map();

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

async function createOrGetUser(keycloakUser) {
  try {
    // FIXED: Use internal URL for API calls (better performance and reliability)
    const usersResponse = await axios.get(
      `${CONFIG.ANYTHINGLLM_INTERNAL_URL}/api/v1/admin/users`,
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.ANYTHINGLLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const existingUser = usersResponse.data.users.find(
      user => user.username === keycloakUser.preferred_username || 
               user.username === keycloakUser.email
    );

    if (existingUser) {
      console.log(`Found existing user: ${existingUser.username} (ID: ${existingUser.id})`);
      return existingUser;
    }

    console.log(`Creating new user: ${keycloakUser.preferred_username || keycloakUser.email}`);
    
    // FIXED: Use internal URL for API calls
    const createUserResponse = await axios.post(
      `${CONFIG.ANYTHINGLLM_INTERNAL_URL}/api/v1/admin/users/new`,
      {
        username: keycloakUser.preferred_username || keycloakUser.email,
        password: crypto.randomBytes(16).toString('hex'),
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

app.get('/sso/login', (req, res) => {
  const state = generateState();
  // FIXED: Use the correct bridge URL for callbacks
  const redirectUri = `${CONFIG.BRIDGE_URL}/sso/callback`;
  
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

  const keycloakAuthUrl = `${CONFIG.KEYCLOAK_URL}/realms/${CONFIG.KEYCLOAK_REALM}/protocol/openid-connect/auth` +
    `?client_id=${CONFIG.KEYCLOAK_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=openid profile email` +
    `&state=${state}`;

  console.log(`Initiating SSO login with state: ${state}`);
  console.log(`Redirect URI: ${redirectUri}`);
  res.redirect(keycloakAuthUrl);
});

app.get('/sso/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.status(400).send(`Authentication failed: ${error}`);
  }

  if (!code || !state) {
    return res.status(400).send('Missing authorization code or state');
  }

  const storedState = authStates.get(state);
  if (!storedState) {
    return res.status(400).send('Invalid or expired state');
  }

  authStates.delete(state);

  try {
    // Exchange code for token
    const tokenResponse = await axios.post(
      `${CONFIG.KEYCLOAK_URL}/realms/${CONFIG.KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CONFIG.KEYCLOAK_CLIENT_ID,
        client_secret: CONFIG.KEYCLOAK_CLIENT_SECRET,
        code: code,
        // FIXED: Use correct bridge URL for redirect_uri
        redirect_uri: `${CONFIG.BRIDGE_URL}/sso/callback`
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    // Get user info
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

    // Create or get user in AnythingLLM
    const anythingLLMUser = await createOrGetUser(keycloakUser);
    
    // Generate auth token and redirect immediately to minimize expiration risk
    console.log(`Generating auth token for user ${anythingLLMUser.id}...`);
    // FIXED: Use internal URL for API calls
    const authToken = await axios.get(
      `${CONFIG.ANYTHINGLLM_INTERNAL_URL}/api/v1/users/${anythingLLMUser.id}/issue-auth-token`,
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.ANYTHINGLLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Redirect to external URL so users see proper domain
    const ssoUrl = `${CONFIG.ANYTHINGLLM_URL}/sso/simple?token=${authToken.data.token}`;
    
    console.log(`SSO completed successfully for user: ${anythingLLMUser.username} (ID: ${anythingLLMUser.id})`);
    console.log(`Redirecting to: ${ssoUrl}`);
    
    res.redirect(ssoUrl);

  } catch (error) {
    console.error('SSO callback error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

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
  console.log(`⚡ Using internal URL for API calls, external URL for user redirects`);
  console.log(`🔧 Bridge URL: ${CONFIG.BRIDGE_URL}`);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down SSO bridge...');
  process.exit(0);
});

module.exports = app;
