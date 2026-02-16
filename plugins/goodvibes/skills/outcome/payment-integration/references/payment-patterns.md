# Payment Integration Patterns Reference

Comprehensive reference for payment provider integration patterns, webhook handling, and security best practices.

## Payment Provider Comparison

| Feature | Stripe | LemonSqueezy | Paddle |
|---------|--------|--------------|--------|
| **Best For** | Maximum flexibility | Digital products/SaaS | Software/SaaS B2B |
| **Merchant of Record** | No | Yes | Yes |
| **Tax Handling** | Manual (Stripe Tax available) | Automatic | Automatic |
| **Transaction Fee** | 2.9% + $0.30 | 5% + $0.50 | 5% + $0.50 |
| **Subscription Management** | Advanced | Good | Good |
| **Invoice Generation** | Yes | Yes | Yes |
| **Free Trial Support** | Yes | Yes | Yes |
| **Webhook Reliability** | Excellent | Good | Good |
| **API Documentation** | Excellent | Good | Good |
| **SDKs** | Many languages | JavaScript | JavaScript/Node |
| **PCI Compliance** | Your responsibility | Handled | Handled |
| **VAT/Tax Compliance** | Your responsibility | Handled | Handled |
| **Fraud Detection** | Advanced (Radar) | Basic | Good |
| **Payment Methods** | 100+ | Card, PayPal | Card, PayPal, Wire |
| **Multi-currency** | 135+ currencies | Yes | Yes |
| **Refund Handling** | Full API control | Dashboard + API | Dashboard + API |
| **Revenue Recovery** | Limited | No | Yes |
| **License Management** | No | Limited | Yes |
| **Setup Complexity** | Medium-High | Low | Low |

## Stripe Webhook Events Reference

### Checkout Events

```typescript
'checkout.session.completed' // Payment successful
'checkout.session.async_payment_succeeded' // Async payment completed
'checkout.session.async_payment_failed' // Async payment failed
'checkout.session.expired' // Session expired without payment
```

### Subscription Events

```typescript
'customer.subscription.created' // New subscription
'customer.subscription.updated' // Subscription modified
'customer.subscription.deleted' // Subscription canceled
'customer.subscription.trial_will_end' // Trial ending soon (3 days)
'customer.subscription.paused' // Subscription paused
'customer.subscription.resumed' // Subscription resumed
```

### Payment Events

```typescript
'payment_intent.succeeded' // One-time payment successful
'payment_intent.payment_failed' // Payment failed
'payment_intent.canceled' // Payment canceled
'payment_intent.requires_action' // Requires 3D Secure
```

### Invoice Events

```typescript
'invoice.created' // Invoice generated
'invoice.finalized' // Invoice finalized
'invoice.payment_succeeded' // Invoice paid
'invoice.payment_failed' // Payment attempt failed
'invoice.upcoming' // Invoice due in 7 days
'invoice.voided' // Invoice voided
```

### Customer Events

```typescript
'customer.created' // New customer
'customer.updated' // Customer info changed
'customer.deleted' // Customer deleted
```

### Charge Events

```typescript
'charge.succeeded' // Charge successful
'charge.failed' // Charge failed
'charge.refunded' // Charge refunded
'charge.dispute.created' // Dispute opened
'charge.dispute.closed' // Dispute resolved
```

## LemonSqueezy Webhook Events Reference

```typescript
'order_created' // New order
'order_refunded' // Order refunded
'subscription_created' // New subscription
'subscription_updated' // Subscription changed
'subscription_cancelled' // Subscription canceled
'subscription_resumed' // Subscription reactivated
'subscription_expired' // Subscription expired
'subscription_paused' // Subscription paused
'subscription_unpaused' // Subscription unpaused
'subscription_payment_success' // Recurring payment successful
'subscription_payment_failed' // Recurring payment failed
'subscription_payment_recovered' // Failed payment recovered
'license_key_created' // License key generated
'license_key_updated' // License key updated
```

## Paddle Webhook Events Reference

```typescript
'transaction.completed' // Transaction successful
'transaction.updated' // Transaction updated
'subscription.created' // New subscription
'subscription.updated' // Subscription modified
'subscription.paused' // Subscription paused
'subscription.resumed' // Subscription resumed
'subscription.canceled' // Subscription canceled
'subscription.past_due' // Payment overdue
'customer.created' // New customer
'customer.updated' // Customer updated
```

## Subscription Lifecycle State Machine

```
[Trial] --trial_end--> [Active]
   |                       |
   |                       |
   +--payment_failed--> [Past Due]
                           |
                           +--payment_recovered--> [Active]
                           |
                           +--grace_period_end--> [Canceled]

[Active] --cancel--> [Canceled]
   |                    |
   |                    |
   +--pause--> [Paused] +--period_end--> [Expired]
                  |
                  +--resume--> [Active]

[Active] --upgrade/downgrade--> [Active] (with proration)
```

### Subscription Status Values

**Stripe:**
- `incomplete` - Initial payment not yet successful
- `incomplete_expired` - Initial payment failed
- `trialing` - In trial period
- `active` - Active subscription
- `past_due` - Payment failed, retrying
- `canceled` - Subscription canceled
- `unpaid` - Payment failed after retries
- `paused` - Subscription paused

**LemonSqueezy:**
- `on_trial` - In trial period
- `active` - Active subscription
- `paused` - Subscription paused
- `past_due` - Payment failed
- `unpaid` - Payment failed, no retry
- `cancelled` - Subscription canceled
- `expired` - Subscription expired

**Paddle:**
- `trialing` - In trial period
- `active` - Active subscription
- `paused` - Subscription paused
- `past_due` - Payment overdue
- `canceled` - Subscription canceled

## Webhook Signature Verification Patterns

### Stripe

```typescript
import Stripe from 'stripe';
import { headers } from 'next/headers';

// NOTE: Validate env vars at app startup in production code
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = headers().get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    return new Response('Webhook signature verification failed', {
      status: 400,
    });
  }
  
  // Process event
  return new Response(JSON.stringify({ received: true }));
}
```

### LemonSqueezy

```typescript
import crypto from 'crypto';

// NOTE: Validate env vars at app startup in production code
const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('x-signature');
  
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }
  
  const hmac = crypto.createHmac('sha256', webhookSecret);
  const digest = hmac.update(body).digest('hex');
  
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer = Buffer.from(digest, 'utf8');
  if (signatureBuffer.length !== digestBuffer.length || !crypto.timingSafeEqual(signatureBuffer, digestBuffer)) {
    return new Response('Invalid signature', { status: 400 });
  }
  
  const event = JSON.parse(body);
  
  // Process event
  return new Response(JSON.stringify({ received: true }));
}
```

### Paddle

```typescript
import { Paddle } from '@paddle/paddle-node-sdk';

const paddleApiKey = process.env.PADDLE_API_KEY;
if (!paddleApiKey) {
  throw new Error('PADDLE_API_KEY is required');
}
const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error('PADDLE_WEBHOOK_SECRET is required');
}

const paddle = new Paddle(paddleApiKey);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('paddle-signature');
  
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }
  
  try {
    const event = paddle.webhooks.unmarshal(
      body,
      webhookSecret,
      signature
    );
    
    // Process event
    return new Response(JSON.stringify({ received: true }));
  } catch (err) {
    return new Response('Invalid signature', { status: 400 });
  }
}
```

## Testing Patterns

### Stripe Test Cards

```typescript
const TEST_CARDS = {
  success: '4242424242424242',
  decline: '4000000000000002',
  insufficient_funds: '4000000000009995',
  lost_card: '4000000000009987',
  stolen_card: '4000000000009979',
  expired_card: '4000000000000069',
  incorrect_cvc: '4000000000000127',
  processing_error: '4000000000000119',
  requires_authentication: '4000002500003155',
};

// All cards accept:
// - Any future expiry date
// - Any 3-digit CVC
// - Any billing ZIP code
```

### Webhook Testing with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger specific events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed

# Test with specific data
stripe trigger payment_intent.succeeded \
  --add payment_intent:amount=5000 \
  --add payment_intent:currency=usd
```

### Mock Webhook Payloads

```typescript
// Test webhook handler with mock data
import { POST } from '@/app/api/webhooks/stripe/route';

const mockCheckoutCompleted = {
  id: 'evt_test_123',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_123',
      amount_total: 2999,
      currency: 'usd',
      customer: 'cus_test_123',
      subscription: 'sub_test_123',
      metadata: {
        userId: 'user_123',
      },
    },
  },
};

// In tests
await POST(
  new Request('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    body: JSON.stringify(mockCheckoutCompleted),
  })
);
```

## Security Checklist

### Essential Security Measures

- [ ] Use HTTPS for all payment endpoints
- [ ] Verify webhook signatures on all webhook handlers
- [ ] Never store card numbers, CVV, or expiry dates
- [ ] Use environment variables for API keys
- [ ] Never commit API keys to version control
- [ ] Use test keys in development, live keys only in production
- [ ] Implement idempotency for webhook handling
- [ ] Validate all input on server side
- [ ] Use hosted checkout pages or Elements (no card data on your server)
- [ ] Enable CORS only for specific domains
- [ ] Log all payment attempts (success and failure)
- [ ] Monitor for unusual payment patterns
- [ ] Implement rate limiting on payment endpoints
- [ ] Use strong authentication for customer portal access
- [ ] Encrypt sensitive data at rest
- [ ] Implement proper session management
- [ ] Add CSP headers for payment pages
- [ ] Keep payment SDKs up to date
- [ ] Implement fraud detection (use Stripe Radar or similar)
- [ ] Set up alerts for failed payments

### PCI Compliance Requirements

If using hosted checkout (Stripe Checkout, LemonSqueezy, Paddle):
- **PCI Level**: SAQ A (simplest)
- **Requirements**: Minimal (no card data touches your server)
- **Annual Cost**: Low

If using Elements/custom forms:
- **PCI Level**: SAQ A-EP
- **Requirements**: More extensive
- **Self-assessment**: Required annually

### Content Security Policy for Payment Pages

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/(checkout|subscribe|payment)/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://js.stripe.com https://app.lemonsqueezy.com",
              "frame-src https://js.stripe.com https://checkout.stripe.com https://app.lemonsqueezy.com",
              "connect-src 'self' https://api.stripe.com https://api.lemonsqueezy.com",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
```

## Common Anti-Patterns

### Anti-Pattern 1: Trusting Client-Side Pricing

```typescript
// WRONG - Client controls price
export async function POST(request: Request) {
  const { amount } = await request.json();
  await stripe.charges.create({ amount }); // Dangerous!
}

// CORRECT - Server-side price lookup
export async function POST(request: Request) {
  const { priceId } = await request.json();
  const price = await stripe.prices.retrieve(priceId);
  await stripe.charges.create({ amount: price.unit_amount });
}
```

### Anti-Pattern 2: Ignoring Webhook Failures

```typescript
// WRONG - Silent failure
export async function POST(request: Request) {
  try {
    await handleWebhook(request);
  } catch (error) {
    // Silent failure - webhook will retry
  }
  return new Response('OK');
}

// CORRECT - Proper error handling
export async function POST(request: Request) {
  try {
    await handleWebhook(request);
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    // Return 500 to trigger retry
    return new Response('Processing failed', { status: 500 });
  }
}
```

### Anti-Pattern 3: No Idempotency

```typescript
// WRONG - Processes duplicate events
export async function handleSubscriptionCreated(subscription) {
  await db.subscription.create({ data: subscription });
}

// CORRECT - Idempotent handling
export async function handleSubscriptionCreated(eventId, subscription) {
  const existing = await db.webhookEvent.findUnique({ where: { id: eventId } });
  if (existing) return; // Already processed
  
  await db.subscription.create({ data: subscription });
  await db.webhookEvent.create({ data: { id: eventId } });
}
```

### Anti-Pattern 4: Storing Card Data

```typescript
// WRONG - PCI violation
const { cardNumber, cvv, expiry } = await request.json();
await db.card.create({ data: { cardNumber, cvv, expiry } });

// CORRECT - Use tokens
const { paymentMethodId } = await request.json(); // Stripe token
await stripe.paymentIntents.create({
  payment_method: paymentMethodId,
});
```

### Anti-Pattern 5: Synchronous Webhook Processing

```typescript
// WRONG - Blocks webhook response
export async function POST(request: Request) {
  const event = await verifyWebhook(request);
  
  // Long-running operations
  await sendEmail(event);
  await updateAnalytics(event);
  await syncToWarehouse(event);
  
  return new Response('OK'); // Timeout risk
}

// CORRECT - Queue for async processing
export async function POST(request: Request) {
  const event = await verifyWebhook(request);
  
  // Quick database write
  await db.webhookEvent.create({ data: event });
  
  // Queue for processing
  await queue.add('process-webhook', { eventId: event.id });
  
  return new Response('OK'); // Fast response
}
```

## Performance Optimization

### Webhook Performance

```typescript
// Use database transactions for atomic updates
await db.$transaction(async (tx) => {
  await tx.subscription.update({ ... });
  await tx.webhookEvent.create({ ... });
});

// Return 200 quickly, process async
setImmediate(async () => {
  try {
    await sendConfirmationEmail(customer);
    await updateAnalytics(event);
  } catch (error) {
    // Log error but don't throw - webhook already acknowledged
    console.error('Async webhook processing failed:', error);
  }
});

return new Response('OK', { status: 200 });
```

### Checkout Performance

```typescript
// Cache price data with TTL
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const priceCache = new Map<string, CacheEntry<Stripe.Price>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getPrice(priceId: string) {
  const cached = priceCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  
  const price = await stripe.prices.retrieve(priceId);
  priceCache.set(priceId, {
    value: price,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  
  return price;
}

// Preload Stripe.js
// <link rel="preconnect" href="https://js.stripe.com">
// <script src="https://js.stripe.com/v3/" async></script>
```

## Monitoring and Alerts

### Key Metrics to Track

- Payment success rate
- Payment failure rate (by error code)
- Webhook processing time
- Webhook delivery failures
- Subscription churn rate
- Revenue per customer
- Failed payment recovery rate
- Refund rate
- Dispute rate

### Alert Thresholds

```typescript
// Set up alerts for:
- Payment success rate < 95%
- Webhook failures > 5% in 1 hour
- Failed payments > 10% of total
- Webhook processing time > 5s
- Dispute rate > 1%
```
