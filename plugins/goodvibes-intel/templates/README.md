# goodvibes-intel templates

Consumed by the `scaffold` tool (`packages/intel/src/tools/scaffold.ts`, §4.1).

- `minimal/vite-react` — Vite 6 + React 19 + TypeScript + Tailwind 3.
- `minimal/next-app` — Next.js 15 (App Router) + TypeScript + Tailwind 3.
- `full/next-saas` — Next.js 15 SaaS starter: NextAuth v5 + Prisma + Stripe.

Ported from `plugins/goodvibes/templates/{minimal,full}` (v1, read-only) with the
plan §9.5 fixes applied:
- `full/next-saas` was missing 3 files its own `template.yaml` `files:` list
  named (`postcss.config.js`, `src/components/Button.tsx`,
  `src/components/Input.tsx`) — added so the manifest and the shipped tree
  match and the Tailwind setup actually works at scaffold time.
- Every `package.json.hbs` had all-`latest` dependency pins — replaced with
  pinned, mutually-compatible versions (React 19, Next 15, Vite 6, Tailwind 3,
  TypeScript 5.9.3 matching intel's single compiler pin). Tailwind stays on
  v3 deliberately: the templates use the v3 `tailwind.config.ts` + PostCSS
  convention, and the v4 CSS-first migration is explicitly deferred elsewhere
  (architecture §4.1 `layout_analysis` responsive section ships only after
  its own CSS-first rebuild) — migrating the scaffold templates to v4 ahead
  of that is out of this lane's scope.
- `templates/_registry.yaml` (generated, never read) does not carry forward
  per plan §9.5.
- `templates/prompt/` (the always-on prompt-chain masters) does not carry
  forward — the prompt chain retires as a mechanism (plan §9.6).

`packages/intel/src/__tests__/scaffold.test.ts` asserts manifest/tree
consistency for every template here (a regression test for the phantom-file
class of bug) plus a `dry_run` scaffold test.
