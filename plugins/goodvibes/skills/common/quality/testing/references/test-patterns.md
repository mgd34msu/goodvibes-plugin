# Test Patterns by Framework

Comprehensive testing patterns for popular frameworks.

## JavaScript/TypeScript

### Jest

#### Basic Test Structure

```javascript
describe('UserService', () => {
  let userService;
  let mockRepository;

  beforeAll(() => {
    // Run once before all tests
  });

  beforeEach(() => {
    // Reset for each test
    mockRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    userService = new UserService(mockRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUser', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, name: 'Alice' };
      mockRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.getUser(1);

      expect(result).toEqual(mockUser);
      expect(mockRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should throw when user not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(userService.getUser(999))
        .rejects
        .toThrow('User not found');
    });
  });
});
```

#### Async Testing

```javascript
// Promises
it('should resolve with data', () => {
  return fetchData().then(data => {
    expect(data).toBe('expected');
  });
});

// Async/await
it('should resolve with data', async () => {
  const data = await fetchData();
  expect(data).toBe('expected');
});

// Rejections
it('should reject with error', async () => {
  await expect(failingFn()).rejects.toThrow('error message');
});

// Resolves/Rejects matchers
it('should resolve', () => {
  return expect(asyncFn()).resolves.toBe('value');
});
```

#### Mocking Patterns

```javascript
// Auto-mock entire module
jest.mock('./database');

// Partial mock
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  riskyFunction: jest.fn(),
}));

// Manual mock (__mocks__/module.js)
// Create file at __mocks__/axios.js
module.exports = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
};

// Spy with implementation
const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

// Mock timers
jest.useFakeTimers();
jest.advanceTimersByTime(1000);
jest.runAllTimers();
jest.useRealTimers();
```

### Vitest

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work', () => {
    const mockFn = vi.fn();
    mockFn('arg');
    expect(mockFn).toHaveBeenCalledWith('arg');
  });

  // Inline snapshots
  it('matches inline snapshot', () => {
    expect({ name: 'test' }).toMatchInlineSnapshot(`
      {
        "name": "test",
      }
    `);
  });
});
```

### React Testing Library

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('LoginForm', () => {
  it('should submit with valid credentials', async () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    // Query elements
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /submit/i });

    // User interactions
    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.click(submitButton);

    // Assertions
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('should show error for invalid email', async () => {
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'invalid');
    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
  });
});
```

---

## Python

### pytest

#### Basic Structure

```python
import pytest
from myapp.services import UserService

class TestUserService:
    @pytest.fixture
    def user_service(self, mock_repository):
        return UserService(mock_repository)

    @pytest.fixture
    def mock_repository(self, mocker):
        return mocker.Mock()

    def test_get_user_returns_user_when_found(self, user_service, mock_repository):
        # Arrange
        mock_repository.find_by_id.return_value = {'id': 1, 'name': 'Alice'}

        # Act
        result = user_service.get_user(1)

        # Assert
        assert result == {'id': 1, 'name': 'Alice'}
        mock_repository.find_by_id.assert_called_once_with(1)

    def test_get_user_raises_when_not_found(self, user_service, mock_repository):
        mock_repository.find_by_id.return_value = None

        with pytest.raises(UserNotFoundError):
            user_service.get_user(999)
```

#### Parametrized Tests

```python
@pytest.mark.parametrize("input,expected", [
    (0, 0),
    (1, 1),
    (2, 4),
    (3, 9),
    (-1, 1),
])
def test_square(input, expected):
    assert square(input) == expected

@pytest.mark.parametrize("invalid_input", [None, "", [], {}])
def test_rejects_invalid_input(invalid_input):
    with pytest.raises(ValueError):
        process(invalid_input)
```

#### Fixtures

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope='session')
def engine():
    return create_engine('sqlite:///:memory:')

@pytest.fixture(scope='session')
def tables(engine):
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture
def db_session(engine, tables):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def sample_user(db_session):
    user = User(email='test@example.com', name='Test User')
    db_session.add(user)
    db_session.commit()
    return user
```

#### Async Tests

```python
import pytest

@pytest.mark.asyncio
async def test_async_function():
    result = await async_fetch_data()
    assert result == expected

# With pytest-asyncio
@pytest.fixture
async def async_client():
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.mark.asyncio
async def test_endpoint(async_client):
    response = await async_client.get("/users/1")
    assert response.status_code == 200
```

---

## Go

### Standard Testing

```go
package user

import (
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

func TestGetUser(t *testing.T) {
    tests := []struct {
        name    string
        userID  int
        want    *User
        wantErr bool
    }{
        {
            name:   "returns user when found",
            userID: 1,
            want:   &User{ID: 1, Name: "Alice"},
        },
        {
            name:    "returns error when not found",
            userID:  999,
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            repo := new(MockRepository)
            service := NewUserService(repo)

            if tt.wantErr {
                repo.On("FindByID", tt.userID).Return(nil, ErrNotFound)
            } else {
                repo.On("FindByID", tt.userID).Return(tt.want, nil)
            }

            got, err := service.GetUser(tt.userID)

            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
                assert.Equal(t, tt.want, got)
            }
        })
    }
}

// Mock implementation
type MockRepository struct {
    mock.Mock
}

func (m *MockRepository) FindByID(id int) (*User, error) {
    args := m.Called(id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*User), args.Error(1)
}
```

### Benchmarks

```go
func BenchmarkGetUser(b *testing.B) {
    service := setupService()

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        service.GetUser(1)
    }
}

func BenchmarkGetUserParallel(b *testing.B) {
    service := setupService()

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            service.GetUser(1)
        }
    })
}
```

---

## Common Test Patterns

### Arrange-Act-Assert (AAA)

```javascript
it('should calculate discount correctly', () => {
  // Arrange
  const product = { price: 100 };
  const discount = 0.2;

  // Act
  const result = calculatePrice(product, discount);

  // Assert
  expect(result).toBe(80);
});
```

### Given-When-Then (BDD)

```javascript
describe('Shopping Cart', () => {
  describe('given a cart with items', () => {
    let cart;

    beforeEach(() => {
      cart = new Cart();
      cart.add({ id: 1, price: 10, quantity: 2 });
    });

    describe('when applying a discount code', () => {
      beforeEach(() => {
        cart.applyDiscount('SAVE10');
      });

      it('then should reduce total by 10%', () => {
        expect(cart.total).toBe(18);
      });
    });
  });
});
```

### Test Data Builders

```javascript
class UserBuilder {
  constructor() {
    this.user = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
    };
  }

  withId(id) {
    this.user.id = id;
    return this;
  }

  withEmail(email) {
    this.user.email = email;
    return this;
  }

  asAdmin() {
    this.user.role = 'admin';
    return this;
  }

  build() {
    return { ...this.user };
  }
}

// Usage
const admin = new UserBuilder().asAdmin().withEmail('admin@test.com').build();
```

### Object Mother

```javascript
// test/mothers/user.mother.js
export const UserMother = {
  default: () => ({
    id: 1,
    email: 'user@example.com',
    name: 'Default User',
    role: 'user',
  }),

  admin: () => ({
    ...UserMother.default(),
    role: 'admin',
    permissions: ['read', 'write', 'delete'],
  }),

  unverified: () => ({
    ...UserMother.default(),
    verified: false,
    verificationToken: 'abc123',
  }),
};
```
