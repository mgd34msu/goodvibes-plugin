# Advanced Mocking Strategies

Patterns for effective test isolation through mocking.

## Mock Types

### Dummy

Objects passed around but never used. Just fill parameters.

```javascript
const dummyLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
};

// Used only to satisfy dependency
const service = new UserService(repository, dummyLogger);
```

### Stub

Provides predetermined responses to calls.

```javascript
const stubRepository = {
  findById: () => ({ id: 1, name: 'Stub User' }),
  findAll: () => [],
};
```

### Spy

Records calls for later verification.

```javascript
// Jest spy
const spy = jest.spyOn(emailService, 'send');

await userService.register({ email: 'test@example.com' });

expect(spy).toHaveBeenCalledWith(
  'test@example.com',
  expect.stringContaining('Welcome')
);
```

### Mock

Pre-programmed with expectations.

```javascript
const mockPaymentGateway = {
  charge: jest.fn()
    .mockResolvedValueOnce({ success: true, transactionId: 'tx123' })
    .mockRejectedValueOnce(new Error('Insufficient funds')),
};
```

### Fake

Working implementation with shortcuts (e.g., in-memory database).

```javascript
class FakeUserRepository {
  constructor() {
    this.users = new Map();
    this.nextId = 1;
  }

  async save(user) {
    const id = this.nextId++;
    const saved = { ...user, id };
    this.users.set(id, saved);
    return saved;
  }

  async findById(id) {
    return this.users.get(id) || null;
  }

  async findAll() {
    return Array.from(this.users.values());
  }
}
```

---

## HTTP Mocking

### Node.js (nock)

```javascript
const nock = require('nock');

describe('API Client', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch user data', async () => {
    nock('https://api.example.com')
      .get('/users/1')
      .reply(200, { id: 1, name: 'Alice' });

    const result = await apiClient.getUser(1);

    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  it('should handle errors', async () => {
    nock('https://api.example.com')
      .get('/users/999')
      .reply(404, { error: 'Not found' });

    await expect(apiClient.getUser(999)).rejects.toThrow('Not found');
  });

  it('should retry on failure', async () => {
    nock('https://api.example.com')
      .get('/users/1')
      .reply(500)
      .get('/users/1')
      .reply(200, { id: 1, name: 'Alice' });

    const result = await apiClient.getUser(1);

    expect(result).toEqual({ id: 1, name: 'Alice' });
  });
});
```

### MSW (Mock Service Worker)

```javascript
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const handlers = [
  rest.get('https://api.example.com/users/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json({ id: Number(id), name: 'Alice' }));
  }),

  rest.post('https://api.example.com/users', async (req, res, ctx) => {
    const body = await req.json();
    return res(ctx.status(201), ctx.json({ id: 1, ...body }));
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('should create user', async () => {
  const result = await apiClient.createUser({ name: 'Bob' });
  expect(result).toEqual({ id: 1, name: 'Bob' });
});

it('should handle server error', async () => {
  server.use(
    rest.get('https://api.example.com/users/:id', (req, res, ctx) => {
      return res(ctx.status(500), ctx.json({ error: 'Server error' }));
    })
  );

  await expect(apiClient.getUser(1)).rejects.toThrow();
});
```

### Python (responses)

```python
import responses

@responses.activate
def test_api_call():
    responses.add(
        responses.GET,
        'https://api.example.com/users/1',
        json={'id': 1, 'name': 'Alice'},
        status=200
    )

    result = api_client.get_user(1)

    assert result == {'id': 1, 'name': 'Alice'}
    assert len(responses.calls) == 1
```

---

## Database Mocking

### Repository Pattern Mock

```javascript
class MockUserRepository {
  constructor() {
    this.users = [];
  }

  async findById(id) {
    return this.users.find(u => u.id === id) || null;
  }

  async findByEmail(email) {
    return this.users.find(u => u.email === email) || null;
  }

  async save(user) {
    const existing = this.users.findIndex(u => u.id === user.id);
    if (existing >= 0) {
      this.users[existing] = user;
    } else {
      user.id = this.users.length + 1;
      this.users.push(user);
    }
    return user;
  }

  // Test helpers
  seed(users) {
    this.users = users;
  }

  clear() {
    this.users = [];
  }
}
```

### SQLite In-Memory

```javascript
// Jest setup for Prisma
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

let prisma;

beforeAll(async () => {
  process.env.DATABASE_URL = 'file::memory:?cache=shared';
  execSync('npx prisma migrate deploy');
  prisma = new PrismaClient();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean tables
  await prisma.user.deleteMany();
  await prisma.order.deleteMany();
});
```

### Python (pytest-django)

```python
import pytest
from django.test import TestCase

@pytest.mark.django_db
class TestUserModel:
    def test_create_user(self):
        user = User.objects.create(email='test@example.com', name='Test')
        assert user.id is not None

    def test_unique_email(self):
        User.objects.create(email='test@example.com', name='Test')
        with pytest.raises(IntegrityError):
            User.objects.create(email='test@example.com', name='Test2')
```

---

## Time Mocking

### JavaScript

```javascript
// Jest fake timers
describe('Scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should execute after delay', () => {
    const callback = jest.fn();

    scheduler.schedule(callback, 1000);

    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should handle intervals', () => {
    const callback = jest.fn();

    scheduler.repeat(callback, 100);

    jest.advanceTimersByTime(350);

    expect(callback).toHaveBeenCalledTimes(3);
  });
});

// Mock Date
const mockDate = new Date('2024-01-15T10:00:00Z');
jest.setSystemTime(mockDate);

// Or use jest-date-mock
import { advanceTo, clear } from 'jest-date-mock';

advanceTo(new Date('2024-01-15'));
// tests...
clear();
```

### Python

```python
from freezegun import freeze_time
from datetime import datetime

@freeze_time("2024-01-15 10:00:00")
def test_timestamp():
    assert datetime.now().year == 2024

# Context manager
def test_time_travel():
    with freeze_time("2024-01-15"):
        result = get_current_date()
        assert result == "2024-01-15"

# Move time
@freeze_time("2024-01-15", tick=True)
def test_with_ticking():
    # Time advances normally from frozen point
    pass

# Or use unittest.mock
from unittest.mock import patch
from datetime import datetime

with patch('mymodule.datetime') as mock_dt:
    mock_dt.now.return_value = datetime(2024, 1, 15)
    result = function_using_datetime()
```

---

## File System Mocking

### JavaScript (mock-fs)

```javascript
const mockFs = require('mock-fs');

describe('FileHandler', () => {
  beforeEach(() => {
    mockFs({
      '/data': {
        'config.json': '{"key": "value"}',
        'users': {
          'alice.json': '{"name": "Alice"}',
          'bob.json': '{"name": "Bob"}',
        },
      },
      '/empty': {},
    });
  });

  afterEach(() => {
    mockFs.restore();
  });

  it('should read config', async () => {
    const config = await fileHandler.readConfig('/data/config.json');
    expect(config).toEqual({ key: 'value' });
  });

  it('should list users', async () => {
    const users = await fileHandler.listFiles('/data/users');
    expect(users).toHaveLength(2);
  });
});
```

### Python (pyfakefs)

```python
import pytest
from pyfakefs.fake_filesystem_unittest import Patcher

def test_file_operations():
    with Patcher() as patcher:
        # Create fake files
        patcher.fs.create_file('/data/config.json', contents='{"key": "value"}')
        patcher.fs.create_dir('/data/users')

        # Test code uses fake filesystem
        result = read_config('/data/config.json')
        assert result == {"key": "value"}

# Or as fixture
@pytest.fixture
def fake_fs(fs):  # 'fs' is provided by pytest-pyfakefs
    fs.create_file('/config.json', contents='{}')
    return fs

def test_with_fixture(fake_fs):
    assert os.path.exists('/config.json')
```

---

## Environment Variable Mocking

### JavaScript

```javascript
describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use production settings', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'https://api.example.com';

    const config = require('./config');

    expect(config.apiUrl).toBe('https://api.example.com');
  });
});
```

### Python

```python
import os
from unittest.mock import patch

def test_with_env_var():
    with patch.dict(os.environ, {'API_KEY': 'test-key'}):
        result = get_api_key()
        assert result == 'test-key'

# Or pytest-env
# pytest.ini:
# [pytest]
# env =
#     API_KEY=test-key
```

---

## Dependency Injection for Testability

### Constructor Injection

```javascript
class OrderService {
  constructor(orderRepository, paymentGateway, emailService) {
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
    this.emailService = emailService;
  }

  async placeOrder(order) {
    const payment = await this.paymentGateway.charge(order.total);
    const saved = await this.orderRepository.save({ ...order, paymentId: payment.id });
    await this.emailService.sendConfirmation(saved);
    return saved;
  }
}

// In tests - easy to inject mocks
const service = new OrderService(
  mockOrderRepository,
  mockPaymentGateway,
  mockEmailService
);
```

### Factory Function

```javascript
function createUserService(deps = {}) {
  const {
    repository = new UserRepository(),
    cache = new Cache(),
    logger = console,
  } = deps;

  return {
    async getUser(id) {
      const cached = await cache.get(`user:${id}`);
      if (cached) return cached;

      const user = await repository.findById(id);
      await cache.set(`user:${id}`, user);
      return user;
    },
  };
}

// In tests
const service = createUserService({
  repository: mockRepository,
  cache: mockCache,
  logger: dummyLogger,
});
```
