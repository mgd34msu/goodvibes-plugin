/**
 * Compiler-host unit tests: one program loads every requested file, and the
 * reference engine is the semantic LanguageService (never a text scan).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';

import {
  CompilerHost,
  disposeCompilerHost,
  toTsPath,
  collectPublicExports,
  collectAllExports,
} from '../host/index.js';

const safeDeleteDir = fileURLToPath(new URL('./fixtures/safe-delete-project', import.meta.url));
const targetFile = `${safeDeleteDir}/src/target.ts`;
const consumerFile = `${safeDeleteDir}/src/consumer.ts`;

const surfaceDir = fileURLToPath(new URL('./fixtures/surface-project', import.meta.url));
const surfaceIndex = `${surfaceDir}/src/index.ts`;
const surfaceInternal = `${surfaceDir}/src/internal.ts`;

afterAll(() => disposeCompilerHost());

describe('CompilerHost', () => {
  it('loads every requested file into ONE program with a tsconfig scope', () => {
    const host = new CompilerHost();
    const { program, configPath } = host.getServiceForFiles([targetFile, consumerFile]);

    expect(program.getSourceFile(toTsPath(targetFile))).toBeDefined();
    expect(program.getSourceFile(toTsPath(consumerFile))).toBeDefined();
    expect(configPath).toContain('tsconfig.json');
    // A type checker is available (the whole point of one shared Program).
    expect(program.getTypeChecker()).toBeDefined();

    host.dispose();
  });

  it('resolves references semantically; comment/string mentions are NOT references', () => {
    const host = new CompilerHost();
    const { service } = host.getServiceForFiles([targetFile, consumerFile]);

    const content = fs.readFileSync(targetFile, 'utf-8');
    const declIdx = content.indexOf('export function countdown');
    const symIdx = content.indexOf('countdown', declIdx);

    const refs = service.getReferencesAtPosition(toTsPath(targetFile), symIdx) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    // consumer.ts mentions "countdown" in a comment and a string; a regex scan
    // would return those. The compiler returns only same-file references.
    for (const ref of refs) {
      expect(ref.fileName).toBe(toTsPath(targetFile));
    }

    host.dispose();
  });

  it('collects public vs internal exports off the shared checker', () => {
    const host = new CompilerHost();
    const { service } = host.getServiceForFiles([surfaceIndex, surfaceInternal]);

    const publicExports = collectPublicExports([surfaceIndex], service);
    const allExports = collectAllExports([surfaceIndex, surfaceInternal], service);

    const publicNames = new Set([...publicExports.values()].map((e) => e.name));
    const allNames = new Set([...allExports.values()].map((e) => e.name));

    expect(publicNames.has('publicFn')).toBe(true);
    expect(publicNames.has('internalHelper')).toBe(false);
    expect(allNames.has('internalHelper')).toBe(true);

    host.dispose();
  });
});
