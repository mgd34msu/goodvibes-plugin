/**
 * `attributes` annotation for component_tree, Lane 4 (§4.4.1).
 *
 * Distilled from frontend-engine `core/accessibility/*`. Per tribunal, attributes
 * are a STATIC overlay of the VERIFIED checks only and NEVER claim computed-style
 * knowledge. Exactly four checks survive:
 *  - role / tree construction (implicit-role resolution),
 *  - missing-alt (img without alt, non-decorative),
 *  - click-without-role (onClick on a non-focusable element with no role),
 *  - ARIA required-attribute presence (explicit role's required attrs).
 * The v1 className-derived checks (focus-outline, color-contrast, expandable) are
 * dropped as computed-style claims. Shape per §4.4.1 (array generalization,
 * ruling R4-2): [{ element, role, issues }] for elements with ≥1 issue.
 *
 * @module frontend/annotations/attributes
 */

import ts from 'typescript';

/** One element's verified accessibility findings. */
export interface AttributeAnnotation {
  /** Element identifier `tag:line`. */
  element: string;
  /** Resolved ARIA role (implicit or explicit). */
  role: string;
  /** Verified issue tokens. */
  issues: string[];
}

const SEMANTIC_ROLES: Record<string, string> = {
  button: 'button', a: 'link', input: 'textbox', select: 'listbox', textarea: 'textbox',
  option: 'option', nav: 'navigation', header: 'banner', footer: 'contentinfo', main: 'main',
  aside: 'complementary', article: 'article', section: 'region', ul: 'list', ol: 'list',
  li: 'listitem', table: 'table', tr: 'row', th: 'columnheader', td: 'cell', form: 'form',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  img: 'img', dialog: 'dialog', summary: 'button', progress: 'progressbar',
};

const INPUT_TYPE_ROLES: Record<string, string> = {
  text: 'textbox', password: 'textbox', email: 'textbox', tel: 'textbox', url: 'textbox',
  search: 'searchbox', number: 'spinbutton', range: 'slider', checkbox: 'checkbox',
  radio: 'radio', button: 'button', submit: 'button', reset: 'button',
};

const NATIVELY_FOCUSABLE = new Set(['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']);

/** ARIA patterns → required attributes (presence-checked only). */
const ARIA_REQUIRED: Record<string, string[]> = {
  dialog: ['aria-labelledby', 'aria-label'],
  alertdialog: ['aria-labelledby', 'aria-label'],
  combobox: ['aria-expanded', 'aria-controls'],
  tab: ['aria-selected'],
  tabpanel: ['aria-labelledby'],
  slider: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
  spinbutton: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
  switch: ['aria-checked'],
};

function getRole(tag: string, attrs: Map<string, string>): string {
  const explicit = attrs.get('role');
  if (explicit) {return explicit;}
  if (tag === 'input') {
    const type = attrs.get('type') || 'text';
    return INPUT_TYPE_ROLES[type] || 'textbox';
  }
  if (tag === 'a' && !attrs.has('href')) {return 'generic';}
  return SEMANTIC_ROLES[tag] || 'generic';
}

/** Read a JSX attribute's value into a string (presence-focused). */
function attrValue(attr: ts.JsxAttribute, _sourceFile: ts.SourceFile): string {
  if (!attr.initializer) {return 'true';}
  if (ts.isStringLiteral(attr.initializer)) {return attr.initializer.text;}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;
    if (ts.isStringLiteral(expr)) {return expr.text;}
    if (expr.kind === ts.SyntaxKind.TrueKeyword) {return 'true';}
    if (expr.kind === ts.SyntaxKind.FalseKeyword) {return 'false';}
    if (ts.isNumericLiteral(expr)) {return expr.text;}
    if (ts.isIdentifier(expr)) {return `[${expr.text}]`;}
    return '[expression]';
  }
  return '';
}

interface ElInfo {
  tag: string;
  line: number;
  attrs: Map<string, string>;
  isComponent: boolean;
}

function collectElements(componentNode: ts.Node, sourceFile: ts.SourceFile): ElInfo[] {
  const elements: ElInfo[] = [];
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const attrs = new Map<string, string>();
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name) {
          attrs.set(attr.name.getText(sourceFile), attrValue(attr, sourceFile));
        } else if (ts.isJsxSpreadAttribute(attr)) {
          attrs.set('[spread]', 'true');
        }
      }
      elements.push({ tag, line, attrs, isComponent: /^[A-Z]/.test(tag) });
    }
    ts.forEachChild(node, visit);
  }
  visit(componentNode);
  return elements;
}

/**
 * Compute the attributes annotation for a component node.
 * @param componentNode - the component's defining AST node
 * @param sourceFile - the host-parsed SourceFile
 */
export function annotateAttributes(componentNode: ts.Node, sourceFile: ts.SourceFile): AttributeAnnotation[] {
  const out: AttributeAnnotation[] = [];

  for (const el of collectElements(componentNode, sourceFile)) {
    const { tag, attrs } = el;
    const role = getRole(tag, attrs);
    const issues: string[] = [];

    // 1. missing-alt (WCAG 1.1.1), verified: img with no alt, not decorative.
    if (tag === 'img' && !attrs.has('alt')) {
      const decorative =
        attrs.get('aria-hidden') === 'true' ||
        attrs.get('role') === 'presentation' ||
        attrs.get('role') === 'none';
      if (!decorative) {issues.push('missing_alt');}
    }

    // 2. click-without-role (WCAG 4.1.2), verified: onClick on a non-focusable
    //    HTML element with no explicit role.
    const hasClick = attrs.has('onClick') || attrs.has('onclick');
    const isInteractive = NATIVELY_FOCUSABLE.has(tag) || attrs.has('role');
    if (hasClick && !isInteractive && !el.isComponent) {
      issues.push('click_without_role');
    }

    // 3. ARIA required-attribute presence, verified: explicit role's required attrs.
    const explicitRole = attrs.get('role');
    if (explicitRole && ARIA_REQUIRED[explicitRole]) {
      const required = ARIA_REQUIRED[explicitRole];
      if (explicitRole === 'dialog' || explicitRole === 'alertdialog') {
        if (!attrs.has('aria-labelledby') && !attrs.has('aria-label')) {
          issues.push('aria_required_missing:aria-labelledby|aria-label');
        }
      } else {
        for (const req of required) {
          if (!attrs.has(req)) {issues.push(`aria_required_missing:${req}`);}
        }
      }
    }

    if (issues.length > 0) {
      out.push({ element: `${tag}:${el.line}`, role, issues });
    }
  }

  return out;
}
