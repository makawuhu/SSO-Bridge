# Keycloak AnythingLLM SSO Bridge

A lightweight Node.js service that enables Single Sign-On (SSO) integration between Keycloak and AnythingLLM, supporting Active Directory federated users.

## 🔧 Architecture

This bridge implements an OAuth2/OpenID Connect flow:

1. **User** clicks login → **SSO Bridge** 
2. **SSO Bridge** redirects to **Keycloak**
3. **Keycloak** authenticates against **Active Directory**
4. **Keycloak** returns to **SSO Bridge** with auth code
5. **SSO Bridge** exchanges code for user info
6. **SSO Bridge** creates/finds user in **AnythingLLM**
7. **SSO Bridge** generates AnythingLLM auth token
8. **User** is logged into **AnythingLLM**

## 🚀 Features

- ✅ OAuth2/OpenID Connect compliant
- ✅ Automatic user provisioning in AnythingLLM
- ✅ CSRF protection with state validation
- ✅ Token expiration optimization
- ✅ Container-ready with Docker support
- ✅ Health check endpoints
- ✅ Active Directory federation through Keycloak

## 📋 Prerequisites

- **Keycloak** server with configured realm
- **AnythingLLM** instance with Simple SSO enabled
- **Docker** and **Docker Compose** (for containerized deployment)
- **Active Directory** (optional, for user federation)

## 🛠️ Installation

### Method 1: Docker Compose (Recommended)

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/keycloak-anythingllm-sso-bridge.git
cd keycloak-anythingllm-sso-bridge
```

2. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Deploy with Docker Compose:**
```bash
docker-compose up -d
```

### Method 2: Portainer Stack

Deploy using the provided `docker-compose.yml` in Portainer:

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
      - ANYTHINGLLM_INTERNAL_URL=http://anythingllm:3001
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

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `KEYCLOAK_URL` | Keycloak server URL | `https://keycloak.example.com` |
| `KEYCLOAK_REALM` | Keycloak realm name | `master` |
| `KEYCLOAK_CLIENT_ID` | OAuth client ID | `anythingllm` |
| `KEYCLOAK_CLIENT_SECRET` | OAuth client secret | `your-secret-here` |
| `ANYTHINGLLM_URL` | External AnythingLLM URL | `https://anythingllm.example.com` |
| `ANYTHINGLLM_INTERNAL_URL` | Internal AnythingLLM URL | `http://anythingllm:3001` |
| `ANYTHINGLLM_API_KEY` | AnythingLLM API key | `your-api-key` |
| `BRIDGE_URL` | SSO bridge external URL | `https://bridge.example.com` |
| `PORT` | Bridge service port | `3000` |

### Keycloak Client Configuration

1. **Create a new client** in your Keycloak realm:
   - Client ID: `anythingllm`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`

2. **Configure Valid Redirect URIs:**
   ```
   https://your-bridge-url.com/sso/callback
   ```

3. **Set Client Scopes:**
   - `openid` (required)
   - `profile` (required)
   - `email` (required)

### AnythingLLM Configuration

1. **Enable Simple SSO** in AnythingLLM settings
2. **Generate API Key** for the bridge service
3. **Set JWT Secret** for token validation

## 🔗 Usage

### Login Flow

Users can initiate SSO login by visiting:
```
https://your-bridge-url.com/sso/login
```

### Integration with AnythingLLM

Replace the standard login button in AnythingLLM with a link to the SSO bridge:

```html
<a href="https://your-bridge-url.com/sso/login" class="sso-login-btn">
  Login with SSO
</a>
```

## 🔍 Monitoring

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

### Logs

Monitor bridge logs for authentication events:
```bash
docker logs sso-bridge -f
```

## 🛡️ Security Considerations

- **State Parameter**: CSRF protection with cryptographically secure random states
- **Token Expiration**: Optimized flow to minimize token expiration issues
- **Environment Variables**: Sensitive configuration moved to environment variables
- **Internal Communication**: Uses container networking for secure internal API calls

## 🧩 Active Directory Integration

This bridge works seamlessly with Keycloak's Active Directory federation:

1. **Configure AD Federation** in Keycloak
2. **Map AD Groups** to Keycloak roles (optional)
3. **Users authenticate** against AD through Keycloak
4. **Bridge provisions** users in AnythingLLM automatically

## 📊 Flow Diagram

```
┌──────────┐    ┌─────────────┐    ┌──────────┐    ┌─────────────┐
│   User   │───▶│ SSO Bridge  │───▶│ Keycloak │───▶│ Active Dir  │
└──────────┘    └─────────────┘    └──────────┘    └─────────────┘
      ▲                │                    │
      │                ▼                    │
      │         ┌─────────────┐            │
      └─────────│ AnythingLLM │◀───────────┘
                └─────────────┘
```

## 🚨 Troubleshooting

### Common Issues

**Token Expiration**
- Ensure `ANYTHINGLLM_INTERNAL_URL` uses container networking
- Check that AnythingLLM is accessible from the bridge container

**Authentication Fails**
- Verify Keycloak client configuration
- Check redirect URI matches exactly
- Validate client secret

**User Creation Errors**
- Confirm AnythingLLM API key is valid
- Check API key permissions for user management

### Debug Mode

Enable debug logging:
```bash
docker run -e NODE_ENV=development sso-bridge:latest
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) for the excellent LLM platform
- [Keycloak](https://www.keycloak.org/) for robust identity management
- [Express.js](https://expressjs.com/) for the web framework

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/yourusername/keycloak-anythingllm-sso-bridge/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yourusername/keycloak-anythingllm-sso-bridge/discussions)
- 📧 **Email**: your-email@example.com

---

**Made with ❤️ for the AnythingLLM community**
