{
  "name": "sso-bridge",
  "version": "1.2.0",
  "description": "SSO Bridge for AnythingLLM and Keycloak - High-performance OAuth2/OIDC authentication service",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "NODE_ENV=development node index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "sso",
    "oauth2",
    "oidc",
    "keycloak",
    "anythingllm",
    "authentication",
    "bridge",
    "docker"
  ],
  "author": "makawuhu",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/makawuhu/SSO-Bridge.git"
  },
  "bugs": {
    "url": "https://github.com/makawuhu/SSO-Bridge/issues"
  },
  "homepage": "https://github.com/makawuhu/SSO-Bridge#readme"
