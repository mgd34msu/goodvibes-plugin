# Score Descriptors

What each score 1-10 means with concrete examples and characteristics.

---

## Score 10: Exemplary

**Label:** Production Excellence

**Description:** Code that sets the standard. Minimal issues, comprehensive testing, excellent documentation, and secure by design.

### Characteristics

- Zero critical or major issues
- At most 1-2 nitpicks
- 90%+ test coverage on critical paths
- All public APIs documented
- Security best practices followed
- Performance optimized
- Clean, consistent style

### Example Code (Score: 10)

```typescript
/**
 * Processes a payment for the given order.
 *
 * @param orderId - The unique order identifier
 * @param paymentMethod - The payment method to use
 * @returns PaymentResult with transaction details
 * @throws PaymentError if payment fails
 * @throws OrderNotFoundError if order doesn't exist
 */
async function processPayment(
  orderId: string,
  paymentMethod: PaymentMethod
): Promise<PaymentResult> {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  if (order.status !== OrderStatus.PENDING) {
    throw new InvalidOrderStateError(order.status);
  }

  const validationResult = validatePaymentMethod(paymentMethod, order);
  if (!validationResult.valid) {
    throw new PaymentValidationError(validationResult.errors);
  }

  try {
    const transaction = await paymentGateway.charge({
      amount: order.total,
      currency: order.currency,
      method: paymentMethod,
      idempotencyKey: `order-${orderId}`,
    });

    await orderRepository.update(orderId, {
      status: OrderStatus.PAID,
      transactionId: transaction.id,
      paidAt: new Date(),
    });

    logger.info('Payment processed successfully', {
      orderId,
      transactionId: transaction.id,
      amount: order.total,
    });

    return {
      success: true,
      transactionId: transaction.id,
      amount: order.total,
    };
  } catch (error) {
    logger.error('Payment processing failed', {
      orderId,
      error: error.message,
    });

    if (error instanceof GatewayTimeoutError) {
      throw new PaymentError('Payment gateway unavailable', { retry: true });
    }

    throw new PaymentError('Payment failed', { cause: error });
  }
}
```

**Why it's a 10:**
- Full JSDoc documentation
- Type safety throughout
- Comprehensive error handling
- Input validation
- Logging with context
- Idempotency support
- Clean separation of concerns

---

## Score 9: Excellent

**Label:** Minor Polish Needed

**Description:** High-quality code with only minor improvements possible. Ready for production with small refinements.

### Characteristics

- No critical or major issues
- 2-4 minor issues or nitpicks
- Strong test coverage
- Good documentation
- Secure patterns used
- Minor style inconsistencies

### Example (What Makes It a 9 Instead of 10)

```typescript
async function processPayment(
  orderId: string,
  paymentMethod: PaymentMethod
): Promise<PaymentResult> {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  // Missing: order status validation (minor issue)

  try {
    const transaction = await paymentGateway.charge({
      amount: order.total,
      currency: order.currency,
      method: paymentMethod,
      // Missing: idempotency key (minor issue)
    });

    await orderRepository.update(orderId, {
      status: OrderStatus.PAID,
      transactionId: transaction.id,
    });

    // Missing: structured logging (nitpick)
    console.log(`Payment processed: ${orderId}`);

    return {
      success: true,
      transactionId: transaction.id,
      amount: order.total,
    };
  } catch (error) {
    throw new PaymentError('Payment failed', { cause: error });
  }
}
```

**Deductions:**
- Missing order status check: -0.5 (minor)
- No idempotency key: -0.5 (minor)
- Console.log instead of logger: -0.25 (nitpick)
- **Total: 1.25 points = Score 8.75 -> 9**

---

## Score 8: Very Good

**Label:** Ready With Small Fixes

**Description:** Solid code that works well. A few areas could be improved but nothing blocking.

### Characteristics

- No critical issues
- 1-2 major issues or several minor issues
- Good test coverage (80%+)
- Most documentation present
- Generally secure
- Some refactoring opportunities

### Example (Score: 8)

```typescript
async function processPayment(orderId: string, method: any) {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new Error('Order not found');  // Generic error (minor)
  }

  const result = await paymentGateway.charge({
    amount: order.total,
    method: method,
  });

  await orderRepository.update(orderId, { status: 'paid' });  // Magic string (minor)

  return result;
}
```

**Deductions:**
- `any` type used: -0.5 (minor)
- Generic Error instead of custom: -0.5 (minor)
- Magic string 'paid': -0.5 (minor)
- No error handling on gateway call: -0.75 (major * 0.5 for simple case)
- **Total: 2.25 points = Score 7.75 -> 8**

---

## Score 7: Good

**Label:** Acceptable Quality

**Description:** Functional code that meets requirements. Has clear improvement areas but is acceptable for production.

### Characteristics

- No critical issues
- 2-3 major issues
- Test coverage present but gaps exist
- Partial documentation
- Some security concerns to address
- Technical debt accumulating

### Example (Score: 7)

```javascript
async function processPayment(orderId, method) {
  // No input validation
  const order = await db.query(`SELECT * FROM orders WHERE id = '${orderId}'`);  // SQL injection risk!

  if (!order[0]) {
    return { error: 'Not found' };  // Error handling via return (inconsistent)
  }

  try {
    const result = await gateway.charge(order[0].total, method);
    await db.query(`UPDATE orders SET status = 'paid' WHERE id = '${orderId}'`);
    return result;
  } catch (e) {
    console.error(e);  // Just logs, doesn't handle properly
    throw e;
  }
}
```

**Deductions:**
- SQL injection vulnerability: -2.0 (critical, but using parameterized could fix)
- Mixed error handling patterns: -0.5
- No input validation: -0.75
- Magic strings: -0.5
- **Total: 3.75 points = Score 6.25 -> Wait, this should be lower due to critical SQL issue**

**Note:** With SQL injection, this would actually score 5-6 due to the critical security issue.

---

## Score 6: Satisfactory

**Label:** Functional But Rough

**Description:** Code works but has notable quality issues. Needs cleanup before being production-ready.

### Characteristics

- May have 1 critical issue (mitigated) or 3+ major issues
- Test coverage below 70%
- Documentation sparse
- Security gaps present
- Performance concerns
- Significant refactoring needed

---

## Score 5: Adequate

**Label:** Meets Minimum Bar

**Description:** Just barely acceptable. Works but has clear problems that need addressing.

### Characteristics

- 1-2 unmitigated critical issues OR 4+ major issues
- Minimal test coverage
- Little to no documentation
- Security issues present
- Poor error handling
- High maintenance burden

---

## Score 4: Below Average

**Label:** Needs Significant Work

**Description:** Code has serious problems. Risky to deploy without major fixes.

### Characteristics

- Multiple critical issues
- Architectural problems
- Very low test coverage
- No documentation
- Security vulnerabilities
- Performance is problematic
- High complexity

### Example (Score: 4)

```javascript
function pay(o, m) {
  var r;
  try {
    var q = "SELECT * FROM orders WHERE id = " + o;
    var ord = db.run(q);
    if (ord) {
      r = gw.pay(ord.tot, m);
      db.run("UPDATE orders SET s = 1 WHERE id = " + o);
    }
  } catch(e) {
    // ignore
  }
  return r;
}
```

**Issues:**
- SQL injection (critical): -2.0
- Single-letter variable names: -0.5
- Empty catch block (critical in payment): -1.5
- No error handling: -1.0
- No validation: -0.75
- Magic values: -0.5
- No documentation: -0.5
- **Total: 6.75 points = Score 3.25 -> 4 (rounded)**

---

## Score 3: Poor

**Label:** Substantial Rework

**Description:** Fundamental problems throughout. Needs significant rewrite rather than fixes.

### Characteristics

- Many critical issues
- Multiple security vulnerabilities
- No tests
- Completely undocumented
- Architectural anti-patterns
- Unmaintainable code

---

## Score 2: Very Poor

**Label:** Fundamental Problems

**Description:** Barely functional. Almost everything needs to be redone.

### Characteristics

- Severe security vulnerabilities
- Crashes or hangs frequently
- Completely untested
- No structure or organization
- Would require complete rewrite

---

## Score 1: Critical

**Label:** Do Not Deploy

**Description:** Dangerous code that should never reach production.

### Characteristics

- Active security vulnerabilities being exploited
- Data loss or corruption occurring
- Crashes on basic usage
- Could cause legal/compliance issues
- No redeeming qualities

### Example (Score: 1)

```javascript
// payment.js - DANGEROUS CODE
app.get('/pay', (req, res) => {
  eval(req.query.code);  // RCE vulnerability!
  db.run(`DELETE FROM orders WHERE id = ${req.query.id}`);  // SQL injection + wrong operation
  res.send('done');
});

// Credentials in code
const API_KEY = 'sk_live_XXXXXXXXX';
const DB_PASSWORD = 'admin123';
```

---

## Score Comparison Table

| Score | Critical | Major | Minor | Nitpick | Deploy? |
|-------|----------|-------|-------|---------|---------|
| 10 | 0 | 0 | 0-1 | 0-2 | Yes |
| 9 | 0 | 0 | 1-2 | 2-4 | Yes |
| 8 | 0 | 1 | 2-3 | Any | Yes |
| 7 | 0 | 2-3 | 3-5 | Any | Yes |
| 6 | 0-1* | 3-4 | Many | Any | Review |
| 5 | 1-2* | 4+ | Many | Any | Caution |
| 4 | 2+ | Many | Many | Any | No |
| 3 | 3+ | Many | Many | Any | No |
| 2 | Many | Many | Many | Any | Never |
| 1 | Severe | Many | Many | Any | Never |

*Mitigated or in non-critical paths

---

## Calibration Examples

Use these to calibrate scoring across reviewers:

### Same Functionality, Different Scores

**Score 9:**
```typescript
const MAX_RETRY_ATTEMPTS = 3;

async function fetchWithRetry<T>(url: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new HttpError(response.status);
      return await response.json();
    } catch (error) {
      if (attempt === MAX_RETRY_ATTEMPTS) throw error;
      await delay(exponentialBackoff(attempt));
    }
  }
  throw new Error('Unreachable');
}
```

**Score 6:**
```javascript
async function fetchWithRetry(url) {
  let i = 0;
  while (i < 3) {
    try {
      let r = await fetch(url);
      return await r.json();
    } catch (e) {
      i++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
```

**Score 3:**
```javascript
function fetchWithRetry(url) {
  var data;
  for (var i = 0; i < 3; i++) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);  // Synchronous!
      xhr.send();
      data = JSON.parse(xhr.responseText);
      break;
    } catch(e) {}
  }
  return data;
}
```
