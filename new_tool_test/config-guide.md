# Configuration Guide

## Environment Variables

```bash
export API_KEY="your-api-key"
export DATABASE_URL="postgres://localhost:5432/mydb"
export DEBUG=true
```

## Config File

Create `config.json`:

```json
{
  "port": 3000,
  "timeout": 30000,
  "maxRetries": 3
}
```

## Security

- Never commit API keys
- Use environment variables
- Rotate secrets regularly