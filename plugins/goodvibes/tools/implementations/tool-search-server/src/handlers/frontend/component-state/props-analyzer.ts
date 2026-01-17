/**
 * Props Analyzer for React Components
 *
 * Extracts and analyzes props received by and passed to components.
 *
 * @module handlers/frontend/component-state/props-analyzer
 */

import ts from 'typescript';
import type { ReceivedProp, ProvidedContext, AnalysisContext } from './types.js';
import { getTypeString } from './utils.js';

/**
 * Extract props from component definition
 */
export function extractReceivedProps(
  componentNode: ts.Node,
  ctx: AnalysisContext
): ReceivedProp[] {
  const props: ReceivedProp[] = [];
  const { sourceFile } = ctx;

  // Find the function parameters
  let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;

  if (ts.isFunctionDeclaration(componentNode)) {
    params = componentNode.parameters;
  } else if (ts.isVariableStatement(componentNode)) {
    for (const decl of componentNode.declarationList.declarations) {
      if (decl.initializer) {
        if (ts.isArrowFunction(decl.initializer)) {
          params = decl.initializer.parameters;
        } else if (ts.isFunctionExpression(decl.initializer)) {
          params = decl.initializer.parameters;
        }
      }
    }
  }

  if (!params || params.length === 0) return props;

  const firstParam = params[0];

  // Destructured props: ({ prop1, prop2 = 'default' })
  if (ts.isObjectBindingPattern(firstParam.name)) {
    for (const element of firstParam.name.elements) {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        const propName = element.name.getText(sourceFile);
        const hasDefault = element.initializer !== undefined;
        const defaultValue = element.initializer?.getText(sourceFile);

        // Try to get type from prop type annotation
        let propType: string | undefined;
        if (firstParam.type && ts.isTypeLiteralNode(firstParam.type)) {
          for (const member of firstParam.type.members) {
            if (ts.isPropertySignature(member) && member.name?.getText(sourceFile) === propName) {
              propType = member.type ? getTypeString(member.type, sourceFile) : undefined;
            }
          }
        }

        props.push({
          name: propName,
          type: propType,
          required: !hasDefault && !element.dotDotDotToken,
          default_value: defaultValue,
        });

        ctx.propNames.add(propName);
      }
    }
  }

  // Also look for Props interface/type if referenced
  if (firstParam.type && ts.isTypeReferenceNode(firstParam.type)) {
    const typeName = firstParam.type.typeName.getText(sourceFile);
    extractPropsFromTypeDefinition(sourceFile, typeName, props, ctx);
  }

  return props;
}

/**
 * Extract props from interface or type definition
 */
export function extractPropsFromTypeDefinition(
  sourceFile: ts.SourceFile,
  typeName: string,
  props: ReceivedProp[],
  ctx: AnalysisContext
): void {
  function visit(node: ts.Node): void {
    // Interface declaration
    if (ts.isInterfaceDeclaration(node) && node.name.getText(sourceFile) === typeName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sourceFile);
          const isOptional = member.questionToken !== undefined;
          const propType = member.type ? getTypeString(member.type, sourceFile) : undefined;

          // Only add if not already present from destructuring
          const existingProp = props.find(p => p.name === propName);
          if (existingProp) {
            // Update required based on interface - optional in interface means not required
            if (isOptional) {
              existingProp.required = false;
            }
            // Also update type if not already set
            if (!existingProp.type && propType) {
              existingProp.type = propType;
            }
          } else {
            props.push({
              name: propName,
              type: propType,
              required: !isOptional,
            });
          }

          ctx.propNames.add(propName);
        }
      }
    }

    // Type alias with object literal
    if (ts.isTypeAliasDeclaration(node) && node.name.getText(sourceFile) === typeName) {
      if (ts.isTypeLiteralNode(node.type)) {
        for (const member of node.type.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const isOptional = member.questionToken !== undefined;
            const propType = member.type ? getTypeString(member.type, sourceFile) : undefined;

            const existingProp = props.find(p => p.name === propName);
            if (existingProp) {
              if (isOptional) {
                existingProp.required = false;
              }
              if (!existingProp.type && propType) {
                existingProp.type = propType;
              }
            } else {
              props.push({
                name: propName,
                type: propType,
                required: !isOptional,
              });
            }

            ctx.propNames.add(propName);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Find context providers in the component
 */
export function findProvidedContexts(componentNode: ts.Node, ctx: AnalysisContext): ProvidedContext[] {
  const provided: ProvidedContext[] = [];
  const { sourceFile } = ctx;

  function visit(node: ts.Node): void {
    // Look for <Context.Provider value={...}>
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      if (tagName.endsWith('.Provider')) {
        const contextName = tagName.replace('.Provider', '');

        // Find the value prop
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name?.getText(sourceFile) === 'value') {
            const valueSource = attr.initializer?.getText(sourceFile) ?? 'unknown';
            provided.push({
              context_name: contextName,
              value_source: valueSource.replace(/^\{|\}$/g, ''),
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return provided;
}
