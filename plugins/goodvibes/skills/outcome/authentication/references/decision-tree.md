# Authentication Decision Tree

Choosing the right authentication approach depends on your project requirements, team expertise, and infrastructure. This decision tree helps you select between managed services, self-hosted solutions, and serverless options.

## Decision Framework

Answer these questions to guide your choice:

1. **Do you need to own the user database?**
   - YES -> Self-hosted or Serverless
   - NO -> Managed service

2. **What is your team's backend expertise?**
   - Strong -> Self-hosted (full control)
   - Moderate -> Serverless (balance)
   - Minimal -> Managed service (easiest)

3. **Do you need enterprise SSO (SAML, AD, Okta)?**
   - YES -> Managed service (Auth0, Clerk)
   - NO -> Any option works

4. **What is your budget?**
   - Free tier only -> Self-hosted or Serverless
   - Moderate ($20-100/mo) -> Managed service
   - Enterprise -> Managed service with SLA

5. **Do you need multi-tenancy or complex user hierarchies?**
   - YES -> Managed service (Clerk) or custom self-hosted
   - NO -> Any option works

## Approach Comparison

### Managed Services

**Examples:** Clerk, Auth0, Firebase Auth, AWS Cognito

**Pros:**
- Fastest time to implementation (hours, not days)
- Pre-built UI components for login/signup
- Handles security updates and compliance (SOC2, GDPR)
- Built-in features: MFA, social login, passwordless, SSO
- No backend code needed for basic flows
- Excellent admin dashboards for user management
- Automatic scaling

**Cons:**
- Monthly cost scales with MAU (monthly active users)
- Vendor lock-in (harder to migrate away)
- Less control over auth flow customization
- User data stored with third party
- Potential latency for auth checks (network roundtrip)

**When to Choose:**
- Rapid prototyping or MVP
- Small team with limited backend resources
- Need enterprise features (SSO, SAML) without building them
- Compliance requirements (SOC2) are easier with certified vendor
- Budget allows for per-user pricing

**Implementation Complexity:** Low (1-2 days)

**Recommended for:**
- SaaS products
- B2B applications with SSO requirements
- Startups prioritizing speed to market
- Teams without dedicated backend engineers

---

### Self-Hosted Solutions

**Examples:** NextAuth (Auth.js), Lucia, Passport.js

**Pros:**
- Full control over user data and auth flow
- No per-user costs (only infrastructure)
- Deep customization possible
- Own your database schema
- No vendor lock-in
- Can work offline/in air-gapped environments

**Cons:**
- Longer implementation time (days to weeks)
- Your team owns security responsibility
- Need to implement features like MFA, passwordless separately
- Session management complexity (scaling, invalidation)
- Need to handle password reset, email verification yourself
- Security updates are your responsibility

**When to Choose:**
- Need full control over user data (regulatory, compliance)
- High user volume makes per-user pricing prohibitive
- Complex custom auth flows not supported by managed services
- Team has strong backend/security expertise
- Privacy-first or self-hosted requirement

**Implementation Complexity:** Medium (3-7 days)

**Recommended for:**
- Open source projects
- Enterprise apps with strict data residency requirements
- High-volume consumer apps (cost savings)
- Projects requiring unique auth flows

---

### Serverless Solutions

**Examples:** Supabase Auth, AWS Amplify Auth, PlanetScale + Lucia

**Pros:**
- Balance between control and convenience
- Own your database (Postgres for Supabase)
- Generous free tiers
- Auto-scaling infrastructure
- Pre-built auth APIs and client SDKs
- Can customize database schema and queries

**Cons:**
- Some vendor lock-in (though less than managed)
- Limited customization compared to pure self-hosted
- Cold start latency in some cases
- May need to understand underlying database

**When to Choose:**
- Want database ownership without managing servers
- Need auth + database + real-time in one platform
- Budget-conscious but want good DX
- Modern stack (Next.js, React, serverless functions)

**Implementation Complexity:** Medium (2-5 days)

**Recommended for:**
- Full-stack apps with Postgres
- Real-time applications (chat, collaboration)
- Projects already using Supabase/Amplify
- Teams comfortable with serverless architecture

---

## Provider-Specific Recommendations

### Clerk

**Best for:**
- React/Next.js applications
- Need beautiful pre-built UI components
- Multi-tenancy (organizations, workspaces)
- User management dashboard for support teams

**Pricing:** $25/mo (Pro) + $0.02/MAU above 10k

**Key Features:**
- Drop-in components (`<SignIn />`, `<UserButton />`)
- Organization/workspace support built-in
- Webhooks for user events
- User impersonation for support

**Setup Time:** ~1 hour

---

### Auth0

**Best for:**
- Enterprise applications
- Need SAML, AD, Okta integration
- Multi-language support (not just JS)
- Strict compliance requirements (HIPAA, SOC2)

**Pricing:** Free (7k MAU) -> $240/mo (Essentials) -> Custom (Enterprise)

**Key Features:**
- Universal Login (hosted auth pages)
- Extensive identity provider integrations
- Advanced security (anomaly detection, breached password detection)
- Fine-grained authorization with rules/actions

**Setup Time:** ~2-4 hours

---

### NextAuth (Auth.js)

**Best for:**
- Next.js applications (App Router or Pages Router)
- Need OAuth providers (Google, GitHub, etc.)
- Want database-backed sessions
- Open source and free

**Pricing:** Free (open source)

**Key Features:**
- First-class Next.js integration
- Database adapters (Prisma, Drizzle, etc.)
- JWT or database sessions
- Easy OAuth provider setup

**Setup Time:** ~4-6 hours

**Trade-offs:**
- Less feature-rich than Clerk/Auth0
- Need to implement MFA, passwordless yourself
- UI is your responsibility

---

### Lucia (Deprecated)

**Note:** Lucia has been deprecated by its author. Consider these alternatives:
- **arctic** and **oslo/auth** (by the same author) - Lightweight auth utilities
- **Better Auth** - Modern alternative with similar philosophy

**Best for (historical reference):**
- Framework-agnostic auth
- TypeScript-first projects
- Want minimal abstraction over auth primitives
- Full control with lightweight library

**Pricing:** Free (open source)

**Key Features:**
- Framework-agnostic (works with any backend)
- Session-based auth with database storage
- Lightweight (~5KB)
- Full TypeScript support

**Setup Time:** ~6-8 hours

**Trade-offs:**
- More code to write than NextAuth
- No pre-built OAuth integrations (implement yourself)
- Lower-level API (more flexible but more work)

---

### Supabase Auth

**Best for:**
- Already using Supabase for database
- Need auth + database + real-time in one platform
- Postgres-backed user storage
- Generous free tier

**Pricing:** Free (50k MAU) -> $25/mo (Pro)

**Key Features:**
- Postgres-backed user table (public.users)
- Row-level security (RLS) integration
- Email/password, magic links, OAuth
- Auto-generated REST and GraphQL APIs

**Setup Time:** ~2-3 hours

**Trade-offs:**
- Tied to Supabase ecosystem
- Less customization than pure self-hosted
- RLS can be complex for advanced permissions

---

## Security Considerations by Approach

### Managed Services

**Built-in Security:**
- [Built-in] Automatic security patches
- [Built-in] DDoS protection
- [Built-in] Compliance certifications (SOC2, GDPR)
- [Built-in] Anomaly detection (Auth0)
- [Built-in] Breached password detection

**Your Responsibility:**
- [Your Responsibility] Secure API keys (CLERK_SECRET_KEY, etc.)
- [Your Responsibility] Configure CORS and allowed domains
- [Your Responsibility] Set up webhooks securely (verify signatures)

---

### Self-Hosted Solutions

**Your Responsibility (Full):**
- [Your Responsibility] Password hashing (use bcrypt cost 10+ or argon2)
- [Your Responsibility] Session token generation (crypto.randomBytes, not Math.random)
- [Your Responsibility] CSRF protection (for cookie-based auth)
- [Your Responsibility] Rate limiting (prevent brute force)
- [Your Responsibility] Input validation (SQL injection, XSS)
- [Your Responsibility] Secure cookie configuration (httpOnly, secure, sameSite)
- [Your Responsibility] Token expiration and refresh logic
- [Your Responsibility] Logout and session invalidation

**Critical Mistakes to Avoid:**
- [Critical Mistake] Storing passwords in plain text
- [Critical Mistake] Using weak hashing (MD5, SHA1)
- [Critical Mistake] Exposing detailed error messages ("User not found" vs "Invalid credentials")
- [Critical Mistake] Not rate limiting login attempts
- [Critical Mistake] Using predictable session tokens
- [Critical Mistake] Not invalidating sessions on logout
- [Critical Mistake] Not rotating refresh tokens

---

### Serverless Solutions

**Shared Responsibility:**
- [Platform] Platform handles: infrastructure security, scaling, basic auth flows
- [Your Responsibility] You handle: application-level security, RLS policies (Supabase), secure integrations

**Supabase-Specific:**
- [Built-in] Row-level security (RLS) protects data at database level
- [Your Responsibility] RLS policies must be written correctly (easy to make mistakes)
- [Your Responsibility] Service role key bypasses RLS (never expose to client)

---

## Migration Paths

### From Managed to Self-Hosted

**Difficulty:** Hard

**Why it's hard:**
- User data export may be limited
- Password hashes may not be exportable (security feature)
- Need to rebuild auth UI
- Session/token format changes (users must re-login)

**If you must migrate:**
1. Export user list (email, metadata)
2. Implement new auth system in parallel
3. Force password reset for all users (can't export hashes)
4. Migrate user metadata to new database
5. Update all auth calls in codebase
6. Coordinate cutover (downtime or dual-write period)

---

### From Self-Hosted to Managed

**Difficulty:** Medium

**Why it's easier:**
- User data is in your database (full export)
- Can use managed service import APIs
- Some providers support password hash import (Auth0, Clerk)

**Steps:**
1. Export users from your database
2. Use provider's bulk import API
3. Update auth calls to use new SDK
4. Test thoroughly in staging
5. Coordinate cutover

---

### Between Serverless Providers

**Difficulty:** Medium

**Why it's moderate:**
- Database may be portable (Postgres)
- Auth APIs differ between providers
- Session format incompatible (users re-login)

---

## Framework-Specific Recommendations

| Framework | Best Choice | Alternative |
|-----------|-------------|-------------|
| **Next.js (App Router)** | Clerk | NextAuth, Better Auth |
| **Next.js (Pages Router)** | NextAuth | Clerk |
| **Remix** | Better Auth | Supabase Auth |
| **Astro** | Better Auth | Auth0 |
| **Express/Fastify** | Passport.js | arctic/oslo |
| **tRPC** | Clerk (with Next.js) | Better Auth |
| **GraphQL** | Auth0 | Custom JWT |
| **Mobile (React Native)** | Supabase Auth | Clerk |

---

## Cost Comparison (10k MAU)

| Provider | Monthly Cost | Notes |
|----------|--------------|-------|
| **Clerk** | $25 (Pro) | Includes all features (check current pricing) |
| **Auth0** | $240 (Essentials) | Free tier ends at 7k MAU (check current pricing) |
| **Supabase** | Free | Up to 50k MAU |
| **NextAuth** | $0 | Infrastructure costs only |
| **Better Auth** | $0 | Infrastructure costs only |
| **Firebase Auth** | Free | Up to 50k MAU |

**At 100k MAU:**
- Clerk: $25 + (90k * $0.02) = $1,825/mo
- Auth0: Custom pricing (~$1,000-2,000/mo)
- Supabase: $25 (Pro, up to 50k) + overages
- Self-hosted: Infrastructure only (~$50-200/mo)

---

## Quick Decision Guide

```
START HERE
|
Do you need SSO (SAML, Okta, AD)?
|-- YES -> Auth0 or Clerk (Enterprise)
+-- NO -> Continue
   |
   Is budget a concern?
   |-- YES -> NextAuth, Better Auth, or Supabase
   +-- NO -> Continue
      |
      Do you need pre-built UI?
      |-- YES -> Clerk
      +-- NO -> Continue
         |
         Strong backend team?
         |-- YES -> Better Auth or NextAuth
         +-- NO -> Supabase or Clerk
```

---

## Summary

**Choose Managed (Clerk/Auth0) if:**
- Speed to market is critical
- Need enterprise features (SSO, SAML)
- Small team, limited backend expertise
- Budget allows per-user pricing

**Choose Self-Hosted (NextAuth/Better Auth) if:**
- Full control over user data required
- High user volume (cost savings)
- Strong backend/security team
- Complex custom auth flows

**Choose Serverless (Supabase) if:**
- Want database ownership without servers
- Need auth + database + real-time together
- Budget-conscious with moderate scale
- Comfortable with serverless architecture

For most modern web apps with moderate scale, **Clerk** or **NextAuth** are the best starting points. For high-scale or privacy-first apps, **Better Auth** or **Supabase** offer more control.
