/**
 * Stack Detector
 *
 * Detects frameworks and tools from configuration files.
 */
import * as fs from 'fs';
import * as path from 'path';
// Configuration file patterns to detect
const CONFIG_DETECTIONS = [
    // Frameworks
    { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], name: 'Next.js', category: 'frameworks' },
    { files: ['nuxt.config.js', 'nuxt.config.ts'], name: 'Nuxt', category: 'frameworks' },
    { files: ['svelte.config.js'], name: 'SvelteKit', category: 'frameworks' },
    { files: ['astro.config.mjs', 'astro.config.ts'], name: 'Astro', category: 'frameworks' },
    { files: ['remix.config.js'], name: 'Remix', category: 'frameworks' },
    { files: ['angular.json'], name: 'Angular', category: 'frameworks' },
    { files: ['vue.config.js', 'vite.config.ts'], name: 'Vue', category: 'frameworks' },
    { files: ['gatsby-config.js', 'gatsby-config.ts'], name: 'Gatsby', category: 'frameworks' },
    { files: ['nest-cli.json'], name: 'NestJS', category: 'frameworks' },
    { files: ['fastify.config.js'], name: 'Fastify', category: 'frameworks' },
    { files: ['hono.config.ts'], name: 'Hono', category: 'frameworks' },
    // Databases & ORMs
    { files: ['prisma/schema.prisma'], name: 'Prisma', category: 'databases' },
    { files: ['drizzle.config.ts', 'drizzle.config.js'], name: 'Drizzle', category: 'databases' },
    { files: ['knexfile.js', 'knexfile.ts'], name: 'Knex', category: 'databases' },
    { files: ['typeorm.config.ts', 'ormconfig.json'], name: 'TypeORM', category: 'databases' },
    { files: ['sequelize.config.js', '.sequelizerc'], name: 'Sequelize', category: 'databases' },
    { files: ['mongoose.config.js'], name: 'Mongoose', category: 'databases' },
    { files: ['supabase/config.toml', '.supabase'], name: 'Supabase', category: 'databases' },
    // Styling
    { files: ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs'], name: 'Tailwind CSS', category: 'styling' },
    { files: ['postcss.config.js', 'postcss.config.mjs'], name: 'PostCSS', category: 'styling' },
    { files: ['styled-components.config.js'], name: 'styled-components', category: 'styling' },
    { files: ['.sassrc', 'sass.config.js'], name: 'Sass', category: 'styling' },
    // Testing
    { files: ['jest.config.js', 'jest.config.ts', 'jest.config.mjs'], name: 'Jest', category: 'testing' },
    { files: ['vitest.config.ts', 'vitest.config.js'], name: 'Vitest', category: 'testing' },
    { files: ['playwright.config.ts', 'playwright.config.js'], name: 'Playwright', category: 'testing' },
    { files: ['cypress.config.ts', 'cypress.config.js', 'cypress.json'], name: 'Cypress', category: 'testing' },
    { files: ['.mocharc.json', '.mocharc.js'], name: 'Mocha', category: 'testing' },
    // Build Tools
    { files: ['vite.config.ts', 'vite.config.js'], name: 'Vite', category: 'buildTools' },
    { files: ['webpack.config.js', 'webpack.config.ts'], name: 'Webpack', category: 'buildTools' },
    { files: ['rollup.config.js', 'rollup.config.mjs'], name: 'Rollup', category: 'buildTools' },
    { files: ['esbuild.config.js', 'esbuild.config.mjs'], name: 'esbuild', category: 'buildTools' },
    { files: ['turbo.json'], name: 'Turborepo', category: 'buildTools' },
    { files: ['nx.json'], name: 'Nx', category: 'buildTools' },
    { files: ['tsup.config.ts', 'tsup.config.js'], name: 'tsup', category: 'buildTools' },
    // Runtime
    { files: ['tsconfig.json'], name: 'TypeScript', category: 'runtime' },
    { files: ['bun.lockb', 'bunfig.toml'], name: 'Bun', category: 'runtime' },
    { files: ['deno.json', 'deno.jsonc'], name: 'Deno', category: 'runtime' },
    // Deployment
    { files: ['vercel.json', '.vercel'], name: 'Vercel', category: 'deployment' },
    { files: ['netlify.toml'], name: 'Netlify', category: 'deployment' },
    { files: ['fly.toml'], name: 'Fly.io', category: 'deployment' },
    { files: ['railway.json', 'railway.toml'], name: 'Railway', category: 'deployment' },
    { files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'], name: 'Docker', category: 'deployment' },
    { files: ['render.yaml'], name: 'Render', category: 'deployment' },
    { files: ['serverless.yml', 'serverless.yaml'], name: 'Serverless', category: 'deployment' },
    { files: ['wrangler.toml'], name: 'Cloudflare Workers', category: 'deployment' },
    // Other
    { files: ['biome.json', 'biome.jsonc'], name: 'Biome', category: 'other' },
    { files: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js'], name: 'ESLint', category: 'other' },
    { files: ['.prettierrc', '.prettierrc.js', 'prettier.config.js'], name: 'Prettier', category: 'other' },
    { files: ['pnpm-workspace.yaml'], name: 'pnpm Workspaces', category: 'other' },
    { files: ['lerna.json'], name: 'Lerna', category: 'other' },
    { files: ['.husky'], name: 'Husky', category: 'other' },
    { files: ['commitlint.config.js', '.commitlintrc'], name: 'Commitlint', category: 'other' },
    { files: ['.storybook'], name: 'Storybook', category: 'other' },
];
/**
 * Check if any of the files exist in the project
 */
function filesExist(cwd, files) {
    return files.some((file) => {
        const filePath = path.join(cwd, file);
        return fs.existsSync(filePath);
    });
}
/**
 * Detect the project's technology stack from config files
 */
export async function detectStack(cwd) {
    const stack = {
        frameworks: [],
        databases: [],
        styling: [],
        testing: [],
        buildTools: [],
        runtime: [],
        deployment: [],
        other: [],
    };
    // Check each detection pattern
    for (const detection of CONFIG_DETECTIONS) {
        if (filesExist(cwd, detection.files)) {
            if (!stack[detection.category].includes(detection.name)) {
                stack[detection.category].push(detection.name);
            }
        }
    }
    // Additional detection from package.json
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const allDeps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies,
            };
            // Detect React (might not have its own config file)
            if (allDeps['react'] && !stack.frameworks.some((f) => ['Next.js', 'Gatsby', 'Remix'].includes(f))) {
                stack.frameworks.push('React');
            }
            // Detect Express
            if (allDeps['express']) {
                stack.frameworks.push('Express');
            }
            // Detect tRPC
            if (allDeps['@trpc/server'] || allDeps['@trpc/client']) {
                stack.other.push('tRPC');
            }
            // Detect GraphQL
            if (allDeps['graphql'] || allDeps['@apollo/server']) {
                stack.other.push('GraphQL');
            }
            // Detect auth libraries
            if (allDeps['next-auth'] || allDeps['@auth/core']) {
                stack.other.push('NextAuth/Auth.js');
            }
            if (allDeps['@clerk/nextjs']) {
                stack.other.push('Clerk');
            }
            // Detect state management
            if (allDeps['zustand']) {
                stack.other.push('Zustand');
            }
            if (allDeps['@tanstack/react-query']) {
                stack.other.push('TanStack Query');
            }
            // Detect UI libraries
            if (allDeps['@radix-ui/react-dialog'] || allDeps['@radix-ui/themes']) {
                stack.styling.push('Radix UI');
            }
            if (allDeps['class-variance-authority']) {
                stack.styling.push('shadcn/ui');
            }
            // Detect form/validation
            if (allDeps['zod']) {
                stack.other.push('Zod');
            }
        }
        catch {
            // Ignore package.json parse errors
        }
    }
    return stack;
}
/**
 * Format detected stack for display
 */
export function formatStack(stack) {
    const sections = [];
    if (stack.frameworks.length > 0) {
        sections.push(`**Frameworks:** ${stack.frameworks.join(', ')}`);
    }
    if (stack.databases.length > 0) {
        sections.push(`**Database/ORM:** ${stack.databases.join(', ')}`);
    }
    if (stack.styling.length > 0) {
        sections.push(`**Styling:** ${stack.styling.join(', ')}`);
    }
    if (stack.testing.length > 0) {
        sections.push(`**Testing:** ${stack.testing.join(', ')}`);
    }
    if (stack.buildTools.length > 0) {
        sections.push(`**Build Tools:** ${stack.buildTools.join(', ')}`);
    }
    if (stack.runtime.length > 0) {
        sections.push(`**Runtime:** ${stack.runtime.join(', ')}`);
    }
    if (stack.deployment.length > 0) {
        sections.push(`**Deployment:** ${stack.deployment.join(', ')}`);
    }
    if (stack.other.length > 0) {
        sections.push(`**Other:** ${stack.other.join(', ')}`);
    }
    return sections.join('\n');
}
