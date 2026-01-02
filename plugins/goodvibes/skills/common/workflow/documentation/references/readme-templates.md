# README Templates by Project Type

Project-specific README templates for common project types.

## Node.js Library

```markdown
# {package-name}

[![npm version](https://badge.fury.io/js/{package-name}.svg)](https://www.npmjs.com/package/{package-name})
[![Build Status](https://github.com/{owner}/{repo}/workflows/CI/badge.svg)](https://github.com/{owner}/{repo}/actions)
[![Coverage Status](https://coveralls.io/repos/github/{owner}/{repo}/badge.svg)](https://coveralls.io/github/{owner}/{repo})

{One-line description}

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

```bash
npm install {package-name}
# or
yarn add {package-name}
# or
pnpm add {package-name}
```

## Quick Start

```javascript
import { someFunction } from '{package-name}';

const result = someFunction({
  option: 'value'
});
```

## API Reference

### `someFunction(options)`

Description of the function.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `options.param1` | `string` | Yes | Description |
| `options.param2` | `number` | No | Default: `10` |

**Returns:** `Promise<Result>`

**Example:**
```javascript
const result = await someFunction({
  param1: 'value',
  param2: 20
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `debug` | `boolean` | `false` | Enable debug logging |

## TypeScript

This package includes TypeScript definitions.

```typescript
import { SomeType, someFunction } from '{package-name}';

const config: SomeType = { ... };
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
```

---

## React Application

```markdown
# {App Name}

{Brief description}

## Demo

[Live Demo]({demo-url}) | [Screenshots](#screenshots)

## Features

- Feature 1
- Feature 2
- Feature 3

## Tech Stack

- **Frontend:** React, TypeScript
- **Styling:** Tailwind CSS / styled-components
- **State:** Redux / Zustand / Context
- **Testing:** Jest, React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/{owner}/{repo}.git
cd {repo}

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ANALYTICS_ID=
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run test` | Run tests |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page components / routes
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── styles/         # Global styles
└── types/          # TypeScript definitions
```

## Screenshots

{Add screenshots here}

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
```

---

## API/Backend Service

```markdown
# {Service Name} API

{Brief description}

## API Documentation

- [OpenAPI Spec](docs/openapi.yaml)
- [API Reference](docs/api.md)

## Features

- RESTful API design
- JWT authentication
- Rate limiting
- Comprehensive logging

## Tech Stack

- **Runtime:** Node.js / Python / Go
- **Framework:** Express / FastAPI / Gin
- **Database:** PostgreSQL
- **Cache:** Redis
- **Queue:** RabbitMQ / Redis

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+

### Installation

```bash
# Clone repository
git clone https://github.com/{owner}/{repo}.git
cd {repo}

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run database migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed

# Start server
npm run dev
```

### Docker

```bash
docker-compose up -d
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | - |
| `JWT_SECRET` | Secret for JWT signing | Yes | - |
| `PORT` | Server port | No | `3000` |

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login and get token |
| POST | `/auth/refresh` | Refresh access token |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List all users |
| GET | `/users/:id` | Get user by ID |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Docker Production

```bash
docker build -t {service-name} .
docker run -p 3000:3000 {service-name}
```

## Monitoring

- Health check: `GET /health`
- Metrics: `GET /metrics` (Prometheus format)

## License

[MIT](LICENSE)
```

---

## CLI Tool

```markdown
# {cli-name}

{Brief description}

[![npm version](https://badge.fury.io/js/{cli-name}.svg)](https://www.npmjs.com/package/{cli-name})

## Installation

```bash
# npm
npm install -g {cli-name}

# yarn
yarn global add {cli-name}

# npx (no install)
npx {cli-name} <command>
```

## Usage

```bash
{cli-name} <command> [options]
```

### Commands

#### `init`

Initialize a new project.

```bash
{cli-name} init [project-name]

Options:
  --template <name>  Use a template (default, minimal, full)
  --git              Initialize git repository
  --install          Install dependencies
```

#### `generate`

Generate new files.

```bash
{cli-name} generate <type> <name>

Types:
  component    Generate a React component
  hook         Generate a custom hook
  service      Generate a service file
```

#### `build`

Build the project.

```bash
{cli-name} build [options]

Options:
  --prod       Production build
  --watch      Watch mode
  --analyze    Analyze bundle size
```

### Configuration

Create a `.{cli-name}rc` file or add to `package.json`:

```json
{
  "{cli-name}": {
    "srcDir": "src",
    "outDir": "dist",
    "template": "default"
  }
}
```

## Examples

### Create new project

```bash
{cli-name} init my-project --template full --git
cd my-project
{cli-name} dev
```

### Generate component

```bash
{cli-name} generate component Button
# Creates src/components/Button/Button.tsx
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
```

---

## Python Library

```markdown
# {package-name}

[![PyPI version](https://badge.fury.io/py/{package-name}.svg)](https://pypi.org/project/{package-name}/)
[![Python Versions](https://img.shields.io/pypi/pyversions/{package-name})](https://pypi.org/project/{package-name}/)
[![Tests](https://github.com/{owner}/{repo}/workflows/Tests/badge.svg)](https://github.com/{owner}/{repo}/actions)

{Brief description}

## Installation

```bash
pip install {package-name}
```

## Quick Start

```python
from {package_name} import SomeClass

client = SomeClass(api_key="your-key")
result = client.do_something()
```

## Features

- Feature 1
- Feature 2
- Feature 3

## Usage

### Basic Usage

```python
from {package_name} import Client

# Initialize client
client = Client(
    api_key="your-api-key",
    timeout=30
)

# Make request
response = client.get_resource("id")
print(response.data)
```

### Async Usage

```python
import asyncio
from {package_name} import AsyncClient

async def main():
    async with AsyncClient(api_key="key") as client:
        result = await client.get_resource("id")
        print(result)

asyncio.run(main())
```

## API Reference

### `Client`

```python
Client(
    api_key: str,
    base_url: str = "https://api.example.com",
    timeout: int = 30
)
```

#### Methods

| Method | Description |
|--------|-------------|
| `get_resource(id)` | Get a resource by ID |
| `list_resources()` | List all resources |
| `create_resource(data)` | Create a new resource |

## Configuration

```python
from {package_name} import configure

configure(
    api_key="your-key",
    debug=True,
    retry_attempts=3
)
```

## Development

```bash
# Clone repository
git clone https://github.com/{owner}/{repo}.git
cd {repo}

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run linting
ruff check .
mypy .
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
```

---

## Monorepo

```markdown
# {Monorepo Name}

{Brief description}

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@scope/core](packages/core) | [![npm](https://img.shields.io/npm/v/@scope/core)](https://www.npmjs.com/package/@scope/core) | Core functionality |
| [@scope/cli](packages/cli) | [![npm](https://img.shields.io/npm/v/@scope/cli)](https://www.npmjs.com/package/@scope/cli) | CLI tool |
| [@scope/react](packages/react) | [![npm](https://img.shields.io/npm/v/@scope/react)](https://www.npmjs.com/package/@scope/react) | React bindings |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone repository
git clone https://github.com/{owner}/{repo}.git
cd {repo}

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Development

```bash
# Start development mode for all packages
pnpm dev

# Run tests
pnpm test

# Run linting
pnpm lint
```

### Working on a specific package

```bash
# Run command in specific package
pnpm --filter @scope/core dev
pnpm --filter @scope/cli build

# Add dependency to package
pnpm --filter @scope/core add lodash
```

## Project Structure

```
.
├── packages/
│   ├── core/           # Core library
│   ├── cli/            # CLI tool
│   └── react/          # React bindings
├── apps/
│   ├── docs/           # Documentation site
│   └── playground/     # Demo application
├── tools/              # Build tools and scripts
└── package.json        # Root package.json
```

## Releasing

```bash
# Create changeset
pnpm changeset

# Version packages
pnpm changeset version

# Publish to npm
pnpm publish -r
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
```
