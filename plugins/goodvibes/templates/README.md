# goodvibes templates

The project templates the `scaffold` tool generates from
(`packages/intel/src/tools/scaffold.ts`). Each template directory holds a
`template.yaml` manifest naming every file it ships, plus the files themselves,
with `.hbs` files rendered at scaffold time.

Templates are grouped by how much they decide for you. A `minimal` template sets
up a working toolchain and stops. The `full` template also picks auth, database,
and billing, which is a much stronger set of opinions to inherit.

| Template | Stack | Use it when |
|---|---|---|
| `minimal/vite-react` | Vite 6, React 19, TypeScript, Tailwind 3 | You want a client-side app with a fast dev server and no framework conventions to learn |
| `minimal/next-app` | Next.js 15 App Router, TypeScript, Tailwind 3, ESLint | You want server rendering and routing conventions, without auth or a database chosen for you |
| `full/next-saas` | Next.js 15, NextAuth v5, Prisma, Stripe, Tailwind 3 | You are starting a SaaS product and want authentication, a data layer, and billing already wired together |

## Dependency pinning

Every `package.json.hbs` pins exact, mutually compatible versions rather than
tracking `latest`. A scaffold is supposed to produce the same working tree today
and in six months, and `latest` makes that impossible to promise. TypeScript is
pinned to the same version intel's compiler host uses, so a scaffolded project
and the analyzers that read it agree on the language version.

Tailwind stays on v3 deliberately. These templates use the v3 convention of a
`tailwind.config.ts` alongside PostCSS, and Tailwind v4 moves that configuration
into CSS. Moving the templates to v4 means rewriting that setup, so they stay on
the version they are actually built around rather than shipping a half-migrated
mix.

## Tests

`packages/intel/src/__tests__/scaffold.test.ts` asserts that every template's
`template.yaml` file list matches the files actually present, in both
directions. That guards the specific failure where a manifest names a file the
template does not ship, so scaffolding succeeds and produces a project that does
not build. The suite also runs a `dry_run` scaffold of each template.
