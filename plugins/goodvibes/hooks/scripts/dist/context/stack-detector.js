/**
 * Stack Detector
 *
 * Detects frameworks, package manager, and TypeScript configuration.
 */
import * as fs from 'fs';
import * as path from 'path';
const STACK_INDICATORS = {
    'next.config': 'Next.js',
    'nuxt.config': 'Nuxt',
    'svelte.config': 'SvelteKit',
    'astro.config': 'Astro',
    'remix.config': 'Remix',
    'vite.config': 'Vite',
    'angular.json': 'Angular',
    'vue.config': 'Vue CLI',
    'prisma/schema.prisma': 'Prisma',
    'drizzle.config': 'Drizzle',
    'tailwind.config': 'Tailwind CSS',
    'vitest.config': 'Vitest',
    'jest.config': 'Jest',
    'playwright.config': 'Playwright',
    'turbo.json': 'Turborepo',
    'pnpm-workspace.yaml': 'pnpm workspaces',
    'tsconfig.json': 'TypeScript',
};
const LOCKFILE_TO_PM = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm',
    'bun.lockb': 'bun',
};
/** Detect the technology stack used in the project. */
export async function detectStack(cwd) {
    const frameworks = [];
    let packageManager = null;
    let hasTypeScript = false;
    let isStrict = false;
    // Check for framework indicators
    for (const [indicator, name] of Object.entries(STACK_INDICATORS)) {
        const checkPath = path.join(cwd, indicator);
        if (fs.existsSync(checkPath) ||
            fs.existsSync(checkPath + '.js') ||
            fs.existsSync(checkPath + '.ts') ||
            fs.existsSync(checkPath + '.mjs')) {
            frameworks.push(name);
            if (name === 'TypeScript')
                hasTypeScript = true;
        }
    }
    // Check lockfiles for package manager
    for (const [lockfile, pm] of Object.entries(LOCKFILE_TO_PM)) {
        if (fs.existsSync(path.join(cwd, lockfile))) {
            packageManager = pm;
            break;
        }
    }
    // Check tsconfig for strict mode
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
        try {
            const content = fs.readFileSync(tsconfigPath, 'utf-8');
            const config = JSON.parse(content);
            isStrict = config.compilerOptions?.strict === true;
        }
        catch { }
    }
    return { frameworks, packageManager, hasTypeScript, isStrict };
}
/** Format stack information for display in context output. */
export function formatStackInfo(info) {
    if (!info || typeof info !== 'object') {
        return '';
    }
    const parts = [];
    if (info.frameworks && info.frameworks.length > 0) {
        parts.push(`Stack: ${info.frameworks.join(', ')}`);
    }
    if (info.hasTypeScript) {
        parts.push(`TypeScript: ${info.isStrict ? 'strict' : 'not strict'}`);
    }
    if (info.packageManager) {
        parts.push(`Package Manager: ${info.packageManager}`);
    }
    return parts.join('\n');
}
