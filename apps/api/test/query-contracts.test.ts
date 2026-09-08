import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sourceRoots = [
  'apps/api/src', 'apps/web/app', 'apps/web/components', 'apps/web/lib',
  'packages/ai/src', 'packages/connectors/src', 'packages/db/src', 'packages/shared/src',
];

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe('database query contracts across runtime source', () => {
  it('every findMany has an explicit take', () => {
    const missing: string[] = [];
    let inspected = 0;
    for (const path of sourceRoots.flatMap(directory => files(join(root, directory)))) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
            && node.expression.name.text === 'findMany') {
          inspected++;
          const input = node.arguments[0];
          if (!input || !ts.isObjectLiteralExpression(input)
              || !input.properties.some(property => property.name?.getText(source) === 'take')) {
            missing.push(`${relative(root, path)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(inspected).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  // This parses the entire monorepo while other suites run. The default 5s
  // timed out at 6.5s on Windows; retain full coverage with a bounded 30s budget.
  }, 30_000);
});
