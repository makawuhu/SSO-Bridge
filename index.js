const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

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

const authStates = new Map();

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

async function createOrGetUser(keycloakUser) {
  try {
    const usersResponse = await axios.get(
      `${CONFIG.ANYTHINGLLM_URL}/api/v1/admin/users`,
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
    
    const createUserResponse = await axios.post(
      `${CONFIG.ANYTHINGLLM_URL}/api/v1/admin/users/new`,
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
  const redirectUri = `${CONFIG.BRIDGE_URL}/sso/callback`;
  
  authStates.set(state, {
    timestamp: Date.now(),
    redirectTo: req.query.redirectTo || '/'
  });

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

    const anythingLLMUser = await createOrGetUser(keycloakUser);
    
    // Generate token and redirect immediately to minimize expiration risk
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
    const ssoUrl = `${CONFIG.ANYTHINGLLM_URL}/sso/simple?token=${authToken.data.token}`;
    
    console.log(`SSO completed successfully for user: ${anythingLLMUser.username} (ID: ${anythingLLMUser.id})`);
    console.log(`Redirecting immediately to: ${ssoUrl}`);
    
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
  console.log(`⚡ Using internal IP for SSO to minimize token expiration`);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down SSO bridge...');
  process.exit(0);
});

module.exports = app;
