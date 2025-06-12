# SSO-Bridge for AnythingLLM and Keycloak

A lightweight Node.js service that enables Single Sign-On (SSO) integration between Keycloak and AnythingLLM, supporting Active Directory federated users.

## How It Works

This bridge implements an OAuth2/OpenID Connect flow:

1. User clicks login → SSO Bridge
2. SSO Bridge redirects to Keycloak
3. Keycloak authenticates against Active Directory
4. Keycloak returns to SSO Bridge with auth code
5. SSO Bridge exchanges code for user info
6. SSO Bridge creates/finds user in AnythingLLM (using internal API)
7. SSO Bridge generates AnythingLLM auth token (using internal API)
8. User is logged into AnythingLLM

## Features

- ✅ OAuth2/OpenID Connect compliant
- ✅ Automatic user provisioning in AnythingLLM
- ✅ CSRF protection with state validation
- ✅ Internal API optimization for fast performance
- ✅ Full environment variable configuration support
- ✅ Container-ready with Docker support
- ✅ Health check endpoints
- ✅ Active Directory federation through Keycloak
- ✅ NPM reverse proxy compatible

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

### 2. Build the Docker image

```bash
docker build -t sso-bridge:latest .
```

### 3. Deploy with Docker Compose/Stack

Use the configuration below in your Portainer stack or docker-compose.yml.

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
| `NODE_ENV` | Node environment | `production` |
| `TZ` | Timezone | `America/Los_Angeles` |

### Docker Stack Configuration (Portainer)

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
      - media_network

  sso-bridge:
    image: sso-bridge:latest
    container_name: sso-bridge
    hostname: sso-bridge
    restart: unless-stopped
    ports:
      - "3002:3000"
    environment:
      # System Configuration
      - NODE_ENV=production
      - TZ=America/Los_Angeles
      
      # SSO Bridge Configuration
      - BRIDGE_URL=https://sso-bridge.makawuhu.com
      
      # AnythingLLM Configuration
      - ANYTHINGLLM_URL=https://anythingllm.makawuhu.com
      - ANYTHINGLLM_INTERNAL_URL=http://192.168.4.7:3001
      - ANYTHINGLLM_API_KEY=your-api-key-here
      
      # Keycloak Configuration
      - KEYCLOAK_URL=https://keycloak.makawuhu.com
      - KEYCLOAK_REALM=master
      - KEYCLOAK_CLIENT_ID=anythingllm
      - KEYCLOAK_CLIENT_SECRET=your-client-secret-here
    networks:
      - media_network
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
  media_network:
    driver: bridge
```

## Keycloak Configuration

### 1. Create Client

Create a new client in your Keycloak realm:

- **Client ID**: `anythingllm`
- **Client Protocol**: `openid-connect`
- **Access Type**: `confidential`

### 2. Configure Redirect URIs

Set **Valid Redirect URIs** to support both domains (required for NPM routing):
```
https://anythingllm.example.com/sso/callback
https://sso-bridge.example.com/sso/callback
```

### 3. Set Web Origins

Add both domains to **Web origins**:
```
https://anythingllm.example.com
https://sso-bridge.example.com
```

### 4. Set Client Scopes

Enable these scopes:
- `openid` (required)
- `profile` (required)
- `email` (required)

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
https://sso-bridge.example.com/sso/login
```

Or configure AnythingLLM to redirect to this URL for authentication.

### Health Check

The bridge provides a health check endpoint:
```bash
curl https://sso-bridge.example.com/health
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

## Performance Features

### Internal API Optimization
- **User Management**: Uses `ANYTHINGLLM_INTERNAL_URL` for direct container-to-container API calls
- **Token Generation**: Fast internal networking eliminates proxy overhead
- **Result**: Super fast SSO authentication flow

### Network Architecture
```
User Browser ←→ NPM ←→ SSO Bridge ←→ Keycloak
                ↓
    SSO Bridge ←→ AnythingLLM (internal API calls)
                ↓
    User Browser ←→ NPM ←→ AnythingLLM (final redirect)
```

## Monitoring

Monitor bridge logs for authentication events:
```bash
docker logs sso-bridge -f
```

Expected startup messages:
```
🔐 Keycloak → AnythingLLM SSO Bridge running on port 3000
📍 Login URL: https://sso-bridge.example.com/sso/login
🔑 Keycloak: https://keycloak.example.com/realms/master
🤖 AnythingLLM: https://anythingllm.example.com
⚡ Using internal URL for API calls, external URL for user redirects
🔧 Bridge URL: https://sso-bridge.example.com
```

## Security Features

- **State Parameter**: CSRF protection with cryptographically secure random states
- **Internal API Communication**: Uses container networking for secure internal API calls
- **Environment Variables**: All sensitive configuration via environment variables
- **Token Optimization**: Minimizes token expiration risk with fast internal API calls

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

#### "Invalid parameter: redirect_uri" Error
- **Cause**: Keycloak client missing correct redirect URIs
- **Fix**: Add both domains to Keycloak client Valid Redirect URIs:
  - `https://anythingllm.example.com/sso/callback`
  - `https://sso-bridge.example.com/sso/callback`

#### Authentication Fails
- Verify Keycloak client configuration
- Check that client secret matches environment variable
- Ensure both domains are in Web Origins

#### User Creation Errors
- Confirm AnythingLLM API key is valid and has admin permissions
- Check that `ANYTHINGLLM_INTERNAL_URL` is accessible from bridge container

#### Slow Performance
- Verify `ANYTHINGLLM_INTERNAL_URL` uses direct IP/container networking
- Check container networking connectivity

### Debug Logging

View container logs for detailed debugging:
```bash
docker logs sso-bridge -f
```

### Network Connectivity Tests

Test internal API connectivity:
```bash
# From SSO-Bridge container
curl http://192.168.4.7:3001/health

# External health checks
curl https://anythingllm.example.com/health
curl https://sso-bridge.example.com/health
```

## Development

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/makawuhu/SSO-Bridge.git
cd SSO-Bridge

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building Docker Image
```bash
docker build -t sso-bridge:latest .
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
