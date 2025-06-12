# SSO-Bridge for AnythingLLM and Keycloak

A lightweight Node.js service that enables Single Sign-On (SSO) integration between Keycloak and AnythingLLM, supporting Active Directory federated users.

## How It Works

This bridge implements an OAuth2/OpenID Connect flow:

1. User clicks login → SSO Bridge
2. SSO Bridge redirects to Keycloak
3. Keycloak authenticates against Active Directory
4. Keycloak returns to SSO Bridge with auth code
5. SSO Bridge exchanges code for user info
6. SSO Bridge creates/finds user in AnythingLLM
7. SSO Bridge generates AnythingLLM auth token
8. User is logged into AnythingLLM

## Features

- ✅ OAuth2/OpenID Connect compliant
- ✅ Automatic user provisioning in AnythingLLM
- ✅ CSRF protection with state validation
- ✅ Token expiration optimization
- ✅ Container-ready with Docker support
- ✅ Health check endpoints
- ✅ Active Directory federation through Keycloak

## Prerequisites

- Keycloak server with configured realm
- AnythingLLM instance with Simple SSO enabled
- Docker and Docker Compose (for containerized deployment)
- Nginx Proxy Manager (for reverse proxy routing)
- Active Directory (optional, for user federation)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/makawuhu/SSO-Bridge.git
cd SSO-Bridge
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Deploy with Docker Compose

```bash
docker-compose up -d
```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `KEYCLOAK_URL` | Keycloak server URL | `https://keycloak.example.com` |
| `KEYCLOAK_REALM` | Keycloak realm name | `master` |
| `KEYCLOAK_CLIENT_ID` | OAuth client ID | `anythingllm` |
| `KEYCLOAK_CLIENT_SECRET` | OAuth client secret | `your-secret-here` |
| `ANYTHINGLLM_URL` | External AnythingLLM URL | `https://anythingllm.example.com` |
| `ANYTHINGLLM_INTERNAL_URL` | Internal AnythingLLM URL for API calls | `http://192.168.4.7:3001` |
| `ANYTHINGLLM_API_KEY` | AnythingLLM API key | `your-api-key` |
| `BRIDGE_URL` | SSO bridge external URL | `https://sso-bridge.example.com` |
| `PORT` | Bridge service port | `3000` |

### Docker Compose Example

```yaml
version: '3.8'
services:
  anythingllm:
    image: mintplexlabs/anythingllm:latest
    container_name: anythingllm
    hostname: anythingllm
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - anythingllm_storage:/app/server/storage
      - anythingllm_logs:/app/server/logs
    environment:
      - TZ=America/Los_Angeles
      - STORAGE_DIR=/app/server/storage
      - SIMPLE_SSO_ENABLED=true
      - DISABLE_TELEMETRY=true
      - JWT_SECRET=your-jwt-secret-key-here
    networks:
      - sso_network

  sso-bridge:
    image: sso-bridge:latest
    container_name: sso-bridge
    hostname: sso-bridge
    restart: unless-stopped
    ports:
      - "3002:3000"
    environment:
      - NODE_ENV=production
      - TZ=America/Los_Angeles
      - KEYCLOAK_URL=https://your-keycloak-url.com
      - KEYCLOAK_REALM=master
      - KEYCLOAK_CLIENT_ID=anythingllm
      - KEYCLOAK_CLIENT_SECRET=your-client-secret
      - ANYTHINGLLM_URL=https://your-anythingllm-url.com
      - ANYTHINGLLM_INTERNAL_URL=http://192.168.4.7:3001
      - ANYTHINGLLM_API_KEY=your-api-key
      - BRIDGE_URL=https://your-bridge-url.com
    networks:
      - sso_network
    depends_on:
      - anythingllm
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  anythingllm_storage:
  anythingllm_logs:

networks:
  sso_network:
    driver: bridge
```

## Keycloak Configuration

### 1. Create Client

Create a new client in your Keycloak realm:

- **Client ID**: `anythingllm`
- **Client Protocol**: `openid-connect`
- **Access Type**: `confidential`

### 2. Configure Redirect URIs

Set **Valid Redirect URIs** to:
```
https://your-anythingllm-url.com/sso/callback
```

**Important**: Use your AnythingLLM domain, not the bridge domain, for the callback URL.

### 3. Set Client Scopes

Enable these scopes:
- `openid` (required)
- `profile` (required)
- `email` (required)

### 4. Web Origins

Add both domains to **Web origins**:
```
https://your-anythingllm-url.com
https://your-bridge-url.com
```

## Nginx Proxy Manager Configuration

### 1. Create Proxy Hosts

Create separate proxy hosts for:
- **AnythingLLM**: `anythingllm.example.com` → `192.168.4.7:3001`
- **SSO-Bridge**: `sso-bridge.example.com` → `192.168.4.7:3002`

### 2. Custom Nginx Configuration

Add this to your **AnythingLLM proxy host** custom nginx configuration:

```nginx
location /sso/ {
    proxy_pass http://192.168.4.7:3002/sso/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /sso/simple {
    proxy_pass http://192.168.4.7:3001/sso/simple;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

**Key Points**:
- `/sso/` routes (login, callback) go to SSO-Bridge on port 3002
- `/sso/simple` route goes to AnythingLLM on port 3001
- Use your actual server IP instead of `192.168.4.7`

## AnythingLLM Configuration

1. **Enable Simple SSO** in AnythingLLM settings
2. **Generate API Key** for the bridge service
3. **Set JWT Secret** for token validation

## Usage

### Initiating SSO Login

Users can initiate SSO login by visiting:
```
https://your-bridge-url.com/sso/login
```

Or configure AnythingLLM to redirect to this URL for authentication.

### Health Check

The bridge provides a health check endpoint:
```bash
curl https://your-bridge-url.com/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-11T10:30:00.000Z",
  "keycloak": "https://keycloak.example.com",
  "anythingllm": "https://anythingllm.example.com"
}
```

## Monitoring

Monitor bridge logs for authentication events:
```bash
docker logs sso-bridge -f
```

## Security Features

- **State Parameter**: CSRF protection with cryptographically secure random states
- **Token Expiration**: Optimized flow to minimize token expiration issues
- **Environment Variables**: Sensitive configuration moved to environment variables
- **Internal Communication**: Uses container networking for secure internal API calls

## Active Directory Integration

This bridge works seamlessly with Keycloak's Active Directory federation:

1. Configure AD Federation in Keycloak
2. Map AD Groups to Keycloak roles (optional)
3. Users authenticate against AD through Keycloak
4. Bridge provisions users in AnythingLLM automatically

```
┌──────────┐ ┌─────────────┐ ┌──────────┐ ┌─────────────┐
│   User   │───▶│ SSO Bridge  │───▶│ Keycloak │───▶│ Active Dir  │
└──────────┘ └─────────────┘ └──────────┘ └─────────────┘
      ▲              │                          │
      │              ▼                          │
      │      ┌─────────────┐                    │
      └──────│ AnythingLLM │◀───────────────────┘
             └─────────────┘
```

## Troubleshooting

### Common Issues

#### Token Expiration
- Ensure `ANYTHINGLLM_INTERNAL_URL` uses direct IP/container networking
- Check that AnythingLLM is accessible from the bridge container

#### Authentication Fails
- Verify Keycloak client configuration
- Check redirect URI matches exactly: `https://your-anythingllm-url.com/sso/callback`
- Validate client secret

#### User Creation Errors
- Confirm AnythingLLM API key is valid
- Check API key permissions for user management

#### "Cannot GET /sso/simple" Error
- Verify NPM custom nginx configuration is applied
- Check that `/sso/simple` routes to AnythingLLM (port 3001)

#### "Invalid parameter: redirect_uri" Error
- Ensure Keycloak client has correct redirect URI
- Check that callback URL uses AnythingLLM domain, not bridge domain

### Debug Logging

Enable debug logging:
```bash
docker run -e NODE_ENV=development sso-bridge:latest
```

### Network Connectivity

Test connectivity between services:
```bash
# From SSO-Bridge container
curl http://192.168.4.7:3001/health

# From external
curl https://anythingllm.example.com/health
curl https://sso-bridge.example.com/health
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) for the excellent LLM platform
- [Keycloak](https://www.keycloak.org/) for robust identity management
- [Express.js](https://expressjs.com/) for the web framework

## Support

- 🐛 Issues: [GitHub Issues](https://github.com/makawuhu/SSO-Bridge/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/makawuhu/SSO-Bridge/discussions)

---

Made with ❤️ for the AnythingLLM community
