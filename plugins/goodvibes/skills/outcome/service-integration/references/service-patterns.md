# Service Integration Reference Patterns

Comprehensive reference for integrating external services into applications.

## Email Provider Comparison

| Provider | Free Tier | Paid Tier | Best For | Key Features |
|----------|-----------|-----------|----------|-------------|
| **Resend** | 100 emails/day | $20/mo for 50K | Transactional emails, DX | React Email support, webhooks, analytics |
| **SendGrid** | 100 emails/day | $20/mo for 100K | Enterprise, high volume | Advanced analytics, A/B testing, templates |
| **Postmark** | None | $15/mo for 10K | High deliverability | Bounce handling, delivery tracking |
| **AWS SES** | 62K/mo (EC2)* | $0.10/1000 | High volume, cost-sensitive | Cheapest at scale, requires AWS setup |

*Note: AWS SES pricing may have changed. Check current AWS pricing documentation.
| **Mailgun** | None | $15/mo for 10K | Developers | Powerful API, email validation |
| **ConvertKit** | None | $29/mo for 1K subs | Creators, marketing | Landing pages, automation, forms |
| **Mailchimp** | 500 contacts | $13/mo for 500 | Marketing campaigns | All-in-one platform, CRM features |
| **Loops** | None | $49/mo for 2K subs | Product updates | Developer-friendly, event-based |

### Decision Matrix

**Choose Resend if:**
- Building transactional email (signup, password reset)
- Want React Email templates
- Need excellent DX
- Starting small to medium volume

**Choose SendGrid if:**
- Need enterprise features (SSO, dedicated IPs)
- High email volume (>100K/month)
- Want advanced analytics and A/B testing
- Require template versioning

**Choose AWS SES if:**
- Sending >1M emails/month
- Cost is primary concern
- Already using AWS infrastructure
- Have DevOps resources

**Choose Postmark if:**
- Deliverability is critical
- Need detailed bounce/spam tracking
- Want white-glove support
- Budget allows premium pricing

## CMS Platform Comparison

| Platform | Hosting | Pricing | Best For | Key Features |
|----------|---------|---------|----------|-------------|
| **Sanity** | Cloud | Free tier generous, $99/mo Pro | Structured content, DX | Real-time collab, GROQ, excellent DX |
| **Contentful** | Cloud | Free for 2 users, $300/mo Team | Enterprise content | GraphQL, robust API, localization |
| **Payload** | Self-hosted | Open source | App backends | TypeScript, auth, local dev |
| **Strapi** | Self-hosted | Open source | Plugin ecosystem | Large community, REST + GraphQL |
| **Prismic** | Cloud | Free tier, $7/mo Standard | Marketing pages | Visual editor, slices, A/B testing |
| **Builder.io** | Cloud | Free tier, $29/mo Growth | Marketing teams | Visual editor, A/B testing, analytics |
| **Directus** | Self-hosted | Open source | Data management | Database-first, SQL-based |

### Decision Matrix

**Choose Sanity if:**
- Need real-time collaboration
- Want best-in-class DX
- Building content-heavy applications
- Prefer structured content with schemas

**Choose Contentful if:**
- Enterprise requirements (SSO, SLAs)
- Need advanced localization
- Want proven stability at scale
- Budget allows enterprise pricing

**Choose Payload if:**
- Want full control (self-hosted)
- Building app backends (not just content)
- Need authentication built-in
- Prefer TypeScript throughout
- Want to avoid vendor lock-in

**Choose Strapi if:**
- Need extensive plugin ecosystem
- Want community support
- Prefer self-hosting
- Need both REST and GraphQL

## File Upload Service Comparison

| Service | Pricing | Best For | Key Features |
|---------|---------|----------|-------------|
| **UploadThing** | $10/mo for 2GB storage | Next.js apps | Zero config, virus scanning, type-safe |
| **Cloudinary** | Free 25GB bandwidth | Image transformations | CDN, on-the-fly transforms, AI features |
| **Vercel Blob** | $0.15/GB storage | Vercel deployments | Edge network, simple API |
| **AWS S3** | $0.023/GB storage | High volume | Industry standard, cheapest at scale |
| **Cloudflare R2** | $0.015/GB storage | S3 alternative | Zero egress fees, S3-compatible |
| **Backblaze B2** | $0.005/GB storage | Archival, backups | Cheapest storage, good egress pricing |
| **Supabase Storage** | 1GB free, $0.021/GB | Postgres users | Integrated with Supabase auth |

### Decision Matrix

**Choose UploadThing if:**
- Using Next.js
- Want zero-config setup
- Need virus scanning built-in
- Prototyping or MVP stage

**Choose Cloudinary if:**
- Heavy image manipulation needs
- Need on-the-fly transformations
- Want CDN included
- Budget allows premium pricing

**Choose S3 if:**
- Need proven reliability
- High volume (>100GB/month)
- Want maximum flexibility
- Have DevOps resources

**Choose R2 if:**
- High egress bandwidth needs
- Want S3 compatibility
- Using Cloudflare ecosystem
- Cost-conscious

## Analytics Platform Comparison

| Platform | Pricing | Best For | Key Features |
|----------|---------|----------|-------------|
| **PostHog** | 1M events free, self-host free | Product analytics | Session replay, feature flags, self-host |
| **Mixpanel** | 20M events/mo free | User analytics | Cohort analysis, retention, funnels |
| **Amplitude** | 10M events/mo free | Product teams | Advanced cohorts, behavioral analytics |
| **Plausible** | $9/mo for 10K views | Privacy-focused | GDPR compliant, simple, lightweight |
| **Umami** | Self-host free | Privacy, self-host | Simple, open source, lightweight |
| **Vercel Analytics** | Free on Vercel | Web Vitals | Core Web Vitals, Vercel-native |
| **Fathom** | $14/mo for 100K views | Simple analytics | Privacy-focused, no cookies |

### Decision Matrix

**Choose PostHog if:**
- Need product analytics + session replay
- Want feature flags built-in
- Prefer self-hosting option
- Building SaaS products

**Choose Mixpanel if:**
- Focus on user behavior
- Need advanced cohort analysis
- Want retention metrics
- Free tier covers your volume

**Choose Plausible if:**
- Privacy is priority
- Need GDPR compliance
- Want simple analytics
- Building marketing sites

**Choose Umami if:**
- Want self-hosted analytics
- Privacy-focused
- Need lightweight solution
- Open source preference

## Retry Pattern Implementations

### Exponential Backoff

```typescript
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryableErrors = () => true,
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry non-retryable errors
      if (!retryableErrors(lastError)) {
        throw lastError;
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * delayMs * 0.1;
      const finalDelay = delayMs + jitter;
      
      console.log(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. ` +
        `Retrying in ${Math.round(finalDelay)}ms`
      );
      
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }
  
  throw lastError!;
}
```

**Usage:**
```typescript
const result = await withRetry(
  () => resend.emails.send(emailOptions),
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    retryableErrors: (error) => {
      // Only retry on rate limits and network errors
      return error.message.includes('rate limit') || 
             error.message.includes('ECONNRESET');
    },
  }
);
```

### Linear Backoff

```typescript
export async function withLinearRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  throw lastError!;
}
```

### Fibonacci Backoff

```typescript
function fibonacci(n: number): number {
  if (n <= 1) return 1;
  let prev = 1, curr = 1;
  for (let i = 2; i <= n; i++) {
    [prev, curr] = [curr, prev + curr];
  }
  return curr;
}

export async function withFibonacciRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 5,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts) {
        const delayMs = fibonacci(attempt) * baseDelayMs;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError!;
}
```

## Circuit Breaker Pattern

### Basic Circuit Breaker

```typescript
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

export class CircuitBreaker<T = unknown> {
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private state: CircuitState = CircuitState.CLOSED;
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 60000,
    private readonly halfOpenSuccessThreshold: number = 2
  ) {}
  
  async execute(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime! > this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        console.log('[CircuitBreaker] Transitioning to half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.state = CircuitState.CLOSED;
        console.log('[CircuitBreaker] Circuit closed after successful requests');
      }
    }
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      console.error('[CircuitBreaker] Circuit opened from half-open state');
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.error(
        `[CircuitBreaker] Circuit opened after ${this.failureCount} failures`
      );
    }
  }
  
  getState(): CircuitState {
    return this.state;
  }
  
  reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.state = CircuitState.CLOSED;
  }
}
```

**Usage:**
```typescript
const emailCircuit = new CircuitBreaker(5, 60000);

try {
  const result = await emailCircuit.execute(() => 
    resend.emails.send(emailOptions)
  );
} catch (error) {
  if (error.message === 'Circuit breaker is open') {
    // Fallback: queue email for later
    await queueEmail(emailOptions);
  } else {
    throw error;
  }
}
```

## Webhook Verification Patterns

**CRITICAL**: Always verify webhook signatures using HMAC with constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks. Never use simple string comparison (`===` or `!==`).

### HMAC Signature Verification

```typescript
import { createHmac } from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Next.js API Route:**
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-webhook-signature');
  const rawBody = await request.text();
  
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 401 }
    );
  }
  
  const isValid = verifyWebhookSignature(
    rawBody,
    signature,
    process.env.WEBHOOK_SECRET!
  );
  
  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }
  
  const body = JSON.parse(rawBody);
  // Process webhook...
  
  return NextResponse.json({ success: true });
}
```

### Svix Webhook Verification (Recommended)

```typescript
import { Webhook } from 'svix';

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id')!,
    'svix-timestamp': request.headers.get('svix-timestamp')!,
    'svix-signature': request.headers.get('svix-signature')!,
  };
  
  const wh = new Webhook(process.env.WEBHOOK_SECRET!);
  
  try {
    const body = wh.verify(payload, headers);
    // Process webhook...
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Webhook] Verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }
}
```

### Stripe Webhook Verification

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature')!;
  
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    
    // Process event...
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe] Webhook verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }
}
```

## Common Anti-Patterns

### 1. Hardcoded Secrets

**BAD:**
```typescript
const resend = new Resend('re_abc123');
const s3 = new S3Client({
  credentials: {
    // Note: These are AWS documentation examples, not real keys
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
});
```

**GOOD:**
```typescript
if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is required');
}
const resend = new Resend(process.env.RESEND_API_KEY);

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS credentials required');
}
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

### 2. No Error Handling

**BAD:**
```typescript
const result = await resend.emails.send(options);
return result.data;
```

**GOOD:**
```typescript
try {
  const { data, error } = await resend.emails.send(options);
  
  if (error) {
    console.error('[Email] Send failed:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }
  
  return data;
} catch (error) {
  console.error('[Email] Unexpected error:', error);
  throw error;
}
```

### 3. Blocking User Requests

**BAD:**
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Blocks response
  await sendWelcomeEmail(body.email);
  await trackSignup(body.userId);
  
  return NextResponse.json({ success: true });
}
```

**GOOD:**
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Fire and forget (use queue in production)
  sendWelcomeEmail(body.email)
    .catch(err => console.error('[Email] Failed:', err));
  trackSignup(body.userId)
    .catch(err => console.error('[Analytics] Failed:', err));
  
  return NextResponse.json({ success: true });
}
```

**BEST (with queue):**
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Queue jobs for background processing
  await queue.enqueue('send-welcome-email', { email: body.email });
  await queue.enqueue('track-signup', { userId: body.userId });
  
  return NextResponse.json({ success: true });
}
```

### 4. Missing Rate Limiting

**BAD:**
```typescript
for (const user of users) {
  // Hits rate limit immediately
  await sendEmail(user.email);
}
```

**GOOD:**
```typescript
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent requests

await Promise.all(
  users.map(user => limit(() => sendEmail(user.email)))
);
```

### 5. No Webhook Verification

**BAD:**
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  // Process without verification - anyone can POST here!
  await processPayment(body);
}
```

**GOOD:**
```typescript
export async function POST(request: NextRequest) {
  const signature = request.headers.get('webhook-signature');
  const payload = await request.text();
  
  const isValid = verifySignature(payload, signature);
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const body = JSON.parse(payload);
  await processPayment(body);
}
```

### 6. Exposing Secrets in Logs

**BAD:**
```typescript
console.log('Calling API with key:', process.env.API_KEY);
console.log('User data:', user); // May contain sensitive fields
```

**GOOD:**
```typescript
console.log('Calling API');
console.log('User:', { id: user.id, email: user.email }); // Only safe fields
```

### 7. No Upload Size Limits

**BAD:**
```typescript
f({ image: {} }) // No limits - vulnerable to DoS
```

**GOOD:**
```typescript
f({ image: { maxFileSize: '4MB', maxFileCount: 4 } })
```

### 8. Synchronous File Processing

**BAD:**
```typescript
export async function POST(request: NextRequest) {
  const file = await request.formData();
  
  // Blocks response for large files
  const optimized = await sharp(file).resize(1920, 1080).toBuffer();
  await s3.upload(optimized);
  
  return NextResponse.json({ success: true });
}
```

**GOOD:**
```typescript
export async function POST(request: NextRequest) {
  const file = await request.formData();
  
  // Queue for background processing
  await queue.enqueue('optimize-image', { fileKey: file.key });
  
  return NextResponse.json({ success: true, processing: true });
}
```

## Testing Patterns

### Mock Service Clients

```typescript
// __mocks__/email.ts
import { SendEmailOptions } from '../email';

const sentEmails: Array<SendEmailOptions & { id: string }> = [];

export async function sendEmail(options: SendEmailOptions) {
  const id = `mock-${Date.now()}`;
  sentEmails.push({ ...options, id });
  return { success: true, id };
}

export function getSentEmails() {
  return sentEmails;
}

export function clearSentEmails() {
  sentEmails.length = 0;
}
```

### Test with Mocks

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { sendEmail, getSentEmails, clearSentEmails } from '../email';

describe('Email Service', () => {
  beforeEach(() => {
    clearSentEmails();
  });
  
  it('sends welcome email', async () => {
    await sendEmail({
      to: 'user@example.com',
      subject: 'Welcome',
      html: '<h1>Welcome!</h1>',
    });
    
    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('user@example.com');
  });
});
```

## Environment Variable Management

### Validation at Startup

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Email
  RESEND_API_KEY: z.string().min(1),
  
  // CMS
  NEXT_PUBLIC_SANITY_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_SANITY_DATASET: z.string().min(1),
  SANITY_WEBHOOK_SECRET: z.string().min(1),
  
  // Uploads
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
  AWS_REGION: z.string().default('us-east-1'),
  
  // Analytics
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

### Type-Safe Access

```typescript
import { env } from './config/env';

const resend = new Resend(env.RESEND_API_KEY);
const s3 = new S3Client({ region: env.AWS_REGION });
```
