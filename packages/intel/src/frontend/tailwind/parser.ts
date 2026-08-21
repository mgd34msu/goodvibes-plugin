/**
 * Tailwind class parser, Lane 4.
 * Ported from frontend-engine `core/tailwind/parser.ts` (both the canonical
 * `parseTailwindClasses` superset used by sizing/element-finder and the
 * layout-aware `parseTailwindClassesLayout` used by the layout analyzer).
 *
 * @module frontend/tailwind/parser
 */

import type { ElementNode, DisplayType, PositionType, SizingStrategyType } from './types.js';
import { TAILWIND_SPACING, TAILWIND_FRACTIONS, MAX_WIDTH_VALUES } from './constants.js';

/** Layout-aware parsed CSS properties. */
export interface ParsedCssProperties {
  width?: { strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'; value?: string };
  height?: { strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'; value?: string };
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  display?: DisplayType;
  flexDirection?: string;
  flexWrap?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  alignItems?: string;
  alignSelf?: string;
  justifyContent?: string;
  justifyItems?: string;
  gap?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridColumn?: string;
  gridRow?: string;
  gridArea?: string;
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  position?: PositionType;
}

/** Parse a width class into a strategy + value. */
export function parseWidthClass(className: string): { strategy: SizingStrategyType; value: string } | undefined {
  const fixedMatch = className.match(/^w-(\d+(?:\.\d+)?|px)$/);
  if (fixedMatch) {
    const value = TAILWIND_SPACING[fixedMatch[1]];
    if (value) {return { strategy: 'fixed', value };}
  }
  const fractionMatch = className.match(/^w-(\d+\/\d+)$/);
  if (fractionMatch) {
    const value = TAILWIND_FRACTIONS[fractionMatch[1]];
    if (value) {return { strategy: 'percentage', value };}
  }
  const arbitraryMatch = className.match(/^w-\[(.+)\]$/);
  if (arbitraryMatch) {
    const value = arbitraryMatch[1];
    if (value.endsWith('%')) {return { strategy: 'percentage', value };}
    if (value.includes('vw') || value.includes('dvw') || value.includes('svw') || value.includes('lvw')) {
      return { strategy: 'viewport', value };
    }
    return { strategy: 'fixed', value };
  }
  const specialWidths: Record<string, { strategy: SizingStrategyType; value: string }> = {
    'w-auto': { strategy: 'auto', value: 'auto' },
    'w-full': { strategy: 'percentage', value: '100%' },
    'w-screen': { strategy: 'viewport', value: '100vw' },
    'w-svw': { strategy: 'viewport', value: '100svw' },
    'w-lvw': { strategy: 'viewport', value: '100lvw' },
    'w-dvw': { strategy: 'viewport', value: '100dvw' },
    'w-min': { strategy: 'content-based', value: 'min-content' },
    'w-max': { strategy: 'content-based', value: 'max-content' },
    'w-fit': { strategy: 'content-based', value: 'fit-content' },
  };
  return specialWidths[className];
}

/** Parse a height class into a strategy + value. */
export function parseHeightClass(className: string): { strategy: SizingStrategyType; value: string } | undefined {
  const fixedMatch = className.match(/^h-(\d+(?:\.\d+)?|px)$/);
  if (fixedMatch) {
    const value = TAILWIND_SPACING[fixedMatch[1]];
    if (value) {return { strategy: 'fixed', value };}
  }
  const fractionMatch = className.match(/^h-(\d+\/\d+)$/);
  if (fractionMatch) {
    const value = TAILWIND_FRACTIONS[fractionMatch[1]];
    if (value) {return { strategy: 'percentage', value };}
  }
  const arbitraryMatch = className.match(/^h-\[(.+)\]$/);
  if (arbitraryMatch) {
    const value = arbitraryMatch[1];
    if (value.endsWith('%')) {return { strategy: 'percentage', value };}
    if (value.includes('vh') || value.includes('dvh') || value.includes('svh') || value.includes('lvh')) {
      return { strategy: 'viewport', value };
    }
    return { strategy: 'fixed', value };
  }
  const specialHeights: Record<string, { strategy: SizingStrategyType; value: string }> = {
    'h-auto': { strategy: 'auto', value: 'auto' },
    'h-full': { strategy: 'percentage', value: '100%' },
    'h-screen': { strategy: 'viewport', value: '100vh' },
    'h-svh': { strategy: 'viewport', value: '100svh' },
    'h-lvh': { strategy: 'viewport', value: '100lvh' },
    'h-dvh': { strategy: 'viewport', value: '100dvh' },
    'h-min': { strategy: 'content-based', value: 'min-content' },
    'h-max': { strategy: 'content-based', value: 'max-content' },
    'h-fit': { strategy: 'content-based', value: 'fit-content' },
  };
  return specialHeights[className];
}

/** Canonical superset parser → Partial<ElementNode> (sizing + element-finder). */
export function parseTailwindClasses(classes: string[]): Partial<ElementNode> {
  const props: Partial<ElementNode> = {
    display: 'block', position: 'static', overflowX: 'visible', overflowY: 'visible',
  };
  const widthClasses: string[] = [];
  const heightClasses: string[] = [];

  for (const className of classes) {
    const widthResult = parseWidthClass(className);
    if (widthResult) {
      props.width = { ...widthResult, classes: [...widthClasses, className] };
      widthClasses.push(className);
      continue;
    }
    const heightResult = parseHeightClass(className);
    if (heightResult) {
      props.height = { ...heightResult, classes: [...heightClasses, className] };
      heightClasses.push(className);
      continue;
    }
    if (className.startsWith('min-w-')) {
      const value = className.slice(6);
      if (value === 'full') {props.minWidth = '100%';}
      else if (value === 'min') {props.minWidth = 'min-content';}
      else if (value === 'max') {props.minWidth = 'max-content';}
      else if (value === 'fit') {props.minWidth = 'fit-content';}
      else if (value === '0') {props.minWidth = '0px';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.minWidth = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.minWidth = TAILWIND_SPACING[value];}
      continue;
    }
    if (className.startsWith('max-w-')) {
      const value = className.slice(6);
      if (MAX_WIDTH_VALUES[value]) {props.maxWidth = MAX_WIDTH_VALUES[value];}
      else if (value.startsWith('[') && value.endsWith(']')) {props.maxWidth = value.slice(1, -1);}
      continue;
    }
    if (className.startsWith('min-h-')) {
      const value = className.slice(6);
      if (value === 'full') {props.minHeight = '100%';}
      else if (value === 'screen') {props.minHeight = '100vh';}
      else if (value === 'min') {props.minHeight = 'min-content';}
      else if (value === 'max') {props.minHeight = 'max-content';}
      else if (value === 'fit') {props.minHeight = 'fit-content';}
      else if (value === '0') {props.minHeight = '0px';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.minHeight = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.minHeight = TAILWIND_SPACING[value];}
      continue;
    }
    if (className.startsWith('max-h-')) {
      const value = className.slice(6);
      if (value === 'full') {props.maxHeight = '100%';}
      else if (value === 'screen') {props.maxHeight = '100vh';}
      else if (value === 'min') {props.maxHeight = 'min-content';}
      else if (value === 'max') {props.maxHeight = 'max-content';}
      else if (value === 'fit') {props.maxHeight = 'fit-content';}
      else if (value === 'none') {props.maxHeight = 'none';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.maxHeight = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.maxHeight = TAILWIND_SPACING[value];}
      continue;
    }
    const displayClasses: Record<string, DisplayType> = {
      block: 'block', 'inline-block': 'inline-block', inline: 'inline', flex: 'flex',
      'inline-flex': 'inline-flex', grid: 'grid', 'inline-grid': 'inline-grid',
      contents: 'contents', hidden: 'none',
    };
    if (displayClasses[className]) { props.display = displayClasses[className]; continue; }
    const flexDirections: Record<string, string> = {
      'flex-row': 'row', 'flex-row-reverse': 'row-reverse', 'flex-col': 'column', 'flex-col-reverse': 'column-reverse',
    };
    if (flexDirections[className]) { props.flexDirection = flexDirections[className]; continue; }
    if (className === 'flex-1') { props.flexGrow = 1; props.flexShrink = 1; props.flexBasis = '0%'; continue; }
    if (className === 'flex-auto') { props.flexGrow = 1; props.flexShrink = 1; props.flexBasis = 'auto'; continue; }
    if (className === 'flex-initial') { props.flexGrow = 0; props.flexShrink = 1; props.flexBasis = 'auto'; continue; }
    if (className === 'flex-none') { props.flexGrow = 0; props.flexShrink = 0; props.flexBasis = 'auto'; continue; }
    if (className === 'grow' || className === 'flex-grow') { props.flexGrow = 1; continue; }
    if (className === 'grow-0' || className === 'flex-grow-0') { props.flexGrow = 0; continue; }
    if (className === 'shrink' || className === 'flex-shrink') { props.flexShrink = 1; continue; }
    if (className === 'shrink-0' || className === 'flex-shrink-0') { props.flexShrink = 0; continue; }
    const basisMatch = className.match(/^basis-(.+)$/);
    if (basisMatch) {
      const value = basisMatch[1];
      if (value === 'auto') {props.flexBasis = 'auto';}
      else if (value === 'full') {props.flexBasis = '100%';}
      else if (TAILWIND_SPACING[value]) {props.flexBasis = TAILWIND_SPACING[value];}
      else if (TAILWIND_FRACTIONS[value]) {props.flexBasis = TAILWIND_FRACTIONS[value];}
      else if (value.startsWith('[') && value.endsWith(']')) {props.flexBasis = value.slice(1, -1);}
      continue;
    }
    const colSpanMatch = className.match(/^col-span-(\d+|full)$/);
    if (colSpanMatch) {
      const value = colSpanMatch[1];
      props.gridColumn = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }
    const rowSpanMatch = className.match(/^row-span-(\d+|full)$/);
    if (rowSpanMatch) {
      const value = rowSpanMatch[1];
      props.gridRow = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }
    const gridColsMatch = className.match(/^grid-cols-(\d+|none|\[.+\])$/);
    if (gridColsMatch) {
      const value = gridColsMatch[1];
      if (value === 'none') {props.gridTemplateColumns = 'none';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.gridTemplateColumns = value.slice(1, -1);}
      else {props.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;}
      continue;
    }
    const gridRowsMatch = className.match(/^grid-rows-(\d+|none|\[.+\])$/);
    if (gridRowsMatch) {
      const value = gridRowsMatch[1];
      if (value === 'none') {props.gridTemplateRows = 'none';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.gridTemplateRows = value.slice(1, -1);}
      else {props.gridTemplateRows = `repeat(${value}, minmax(0, 1fr))`;}
      continue;
    }
    const overflows: Record<string, string> = {
      'overflow-auto': 'auto', 'overflow-hidden': 'hidden', 'overflow-clip': 'clip',
      'overflow-visible': 'visible', 'overflow-scroll': 'scroll',
    };
    if (overflows[className]) { props.overflowX = overflows[className]; props.overflowY = overflows[className]; continue; }
    const overflowX: Record<string, string> = {
      'overflow-x-auto': 'auto', 'overflow-x-hidden': 'hidden', 'overflow-x-clip': 'clip',
      'overflow-x-visible': 'visible', 'overflow-x-scroll': 'scroll',
    };
    if (overflowX[className]) { props.overflowX = overflowX[className]; continue; }
    const overflowY: Record<string, string> = {
      'overflow-y-auto': 'auto', 'overflow-y-hidden': 'hidden', 'overflow-y-clip': 'clip',
      'overflow-y-visible': 'visible', 'overflow-y-scroll': 'scroll',
    };
    if (overflowY[className]) { props.overflowY = overflowY[className]; continue; }
    const positions: Record<string, PositionType> = {
      static: 'static', fixed: 'fixed', absolute: 'absolute', relative: 'relative', sticky: 'sticky',
    };
    if (positions[className]) { props.position = positions[className]; continue; }
  }

  return props;
}

/** Layout-aware parser → ParsedCssProperties (layout hierarchy). */
export function parseTailwindClassesLayout(classes: string[]): ParsedCssProperties {
  const props: ParsedCssProperties = {};

  const mapStrategy = (s: SizingStrategyType): 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content' =>
    s === 'content-based' ? 'fit-content'
    : s === 'viewport' ? 'fixed'
    : s === 'flex-controlled' ? 'flex'
    : s === 'grid-controlled' ? 'auto'
    : s === 'inherit' ? 'auto'
    : (s as 'fixed' | 'percentage' | 'auto');

  for (const className of classes) {
    const widthResult = parseWidthClass(className);
    if (widthResult) {
      props.width = { strategy: mapStrategy(widthResult.strategy), value: widthResult.value };
      continue;
    }
    const heightResult = parseHeightClass(className);
    if (heightResult) {
      props.height = { strategy: mapStrategy(heightResult.strategy), value: heightResult.value };
      continue;
    }
    if (className.startsWith('min-w-')) {
      const value = className.slice(6);
      if (value === 'full') {props.minWidth = '100%';}
      else if (value === 'min') {props.minWidth = 'min-content';}
      else if (value === 'max') {props.minWidth = 'max-content';}
      else if (value === 'fit') {props.minWidth = 'fit-content';}
      else if (value === '0') {props.minWidth = '0px';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.minWidth = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.minWidth = TAILWIND_SPACING[value];}
      continue;
    }
    if (className.startsWith('max-w-')) {
      const value = className.slice(6);
      if (MAX_WIDTH_VALUES[value]) {props.maxWidth = MAX_WIDTH_VALUES[value];}
      else if (value.startsWith('[') && value.endsWith(']')) {props.maxWidth = value.slice(1, -1);}
      continue;
    }
    if (className.startsWith('min-h-')) {
      const value = className.slice(6);
      if (value === 'full') {props.minHeight = '100%';}
      else if (value === 'screen') {props.minHeight = '100vh';}
      else if (value === 'min') {props.minHeight = 'min-content';}
      else if (value === 'max') {props.minHeight = 'max-content';}
      else if (value === 'fit') {props.minHeight = 'fit-content';}
      else if (value === '0') {props.minHeight = '0px';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.minHeight = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.minHeight = TAILWIND_SPACING[value];}
      continue;
    }
    if (className.startsWith('max-h-')) {
      const value = className.slice(6);
      if (value === 'full') {props.maxHeight = '100%';}
      else if (value === 'screen') {props.maxHeight = '100vh';}
      else if (value === 'min') {props.maxHeight = 'min-content';}
      else if (value === 'max') {props.maxHeight = 'max-content';}
      else if (value === 'fit') {props.maxHeight = 'fit-content';}
      else if (value === 'none') {props.maxHeight = 'none';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.maxHeight = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.maxHeight = TAILWIND_SPACING[value];}
      continue;
    }
    const displayClasses: Record<string, DisplayType> = {
      block: 'block', 'inline-block': 'inline-block', inline: 'inline', flex: 'flex',
      'inline-flex': 'inline-flex', grid: 'grid', 'inline-grid': 'inline-grid',
      contents: 'contents', hidden: 'none',
    };
    if (displayClasses[className]) { props.display = displayClasses[className]; continue; }
    const flexDirections: Record<string, string> = {
      'flex-row': 'row', 'flex-row-reverse': 'row-reverse', 'flex-col': 'column', 'flex-col-reverse': 'column-reverse',
    };
    if (flexDirections[className]) { props.flexDirection = flexDirections[className]; continue; }
    const flexWraps: Record<string, string> = {
      'flex-wrap': 'wrap', 'flex-wrap-reverse': 'wrap-reverse', 'flex-nowrap': 'nowrap',
    };
    if (flexWraps[className]) { props.flexWrap = flexWraps[className]; continue; }
    if (className === 'flex-1') { props.flexGrow = 1; props.flexShrink = 1; props.flexBasis = '0%'; continue; }
    if (className === 'flex-auto') { props.flexGrow = 1; props.flexShrink = 1; props.flexBasis = 'auto'; continue; }
    if (className === 'flex-initial') { props.flexGrow = 0; props.flexShrink = 1; props.flexBasis = 'auto'; continue; }
    if (className === 'flex-none') { props.flexGrow = 0; props.flexShrink = 0; props.flexBasis = 'auto'; continue; }
    if (className === 'grow' || className === 'flex-grow') { props.flexGrow = 1; continue; }
    if (className === 'grow-0' || className === 'flex-grow-0') { props.flexGrow = 0; continue; }
    if (className === 'shrink' || className === 'flex-shrink') { props.flexShrink = 1; continue; }
    if (className === 'shrink-0' || className === 'flex-shrink-0') { props.flexShrink = 0; continue; }
    const basisMatch = className.match(/^basis-(.+)$/);
    if (basisMatch) {
      const value = basisMatch[1];
      if (value === 'auto') {props.flexBasis = 'auto';}
      else if (value === 'full') {props.flexBasis = '100%';}
      else if (TAILWIND_SPACING[value]) {props.flexBasis = TAILWIND_SPACING[value];}
      else if (TAILWIND_FRACTIONS[value]) {props.flexBasis = TAILWIND_FRACTIONS[value];}
      else if (value.startsWith('[') && value.endsWith(']')) {props.flexBasis = value.slice(1, -1);}
      continue;
    }
    const alignItems: Record<string, string> = {
      'items-start': 'flex-start', 'items-end': 'flex-end', 'items-center': 'center',
      'items-baseline': 'baseline', 'items-stretch': 'stretch',
    };
    if (alignItems[className]) { props.alignItems = alignItems[className]; continue; }
    const alignSelf: Record<string, string> = {
      'self-auto': 'auto', 'self-start': 'flex-start', 'self-end': 'flex-end',
      'self-center': 'center', 'self-stretch': 'stretch', 'self-baseline': 'baseline',
    };
    if (alignSelf[className]) { props.alignSelf = alignSelf[className]; continue; }
    const justifyContent: Record<string, string> = {
      'justify-start': 'flex-start', 'justify-end': 'flex-end', 'justify-center': 'center',
      'justify-between': 'space-between', 'justify-around': 'space-around',
      'justify-evenly': 'space-evenly', 'justify-stretch': 'stretch',
    };
    if (justifyContent[className]) { props.justifyContent = justifyContent[className]; continue; }
    const justifyItems: Record<string, string> = {
      'justify-items-start': 'start', 'justify-items-end': 'end',
      'justify-items-center': 'center', 'justify-items-stretch': 'stretch',
    };
    if (justifyItems[className]) { props.justifyItems = justifyItems[className]; continue; }
    const gapMatch = className.match(/^gap-(\d+(?:\.\d+)?|px|\[.+\])$/);
    if (gapMatch) {
      const value = gapMatch[1];
      if (value.startsWith('[') && value.endsWith(']')) {props.gap = value.slice(1, -1);}
      else if (TAILWIND_SPACING[value]) {props.gap = TAILWIND_SPACING[value];}
      continue;
    }
    const gridColsMatch = className.match(/^grid-cols-(\d+|none|\[.+\])$/);
    if (gridColsMatch) {
      const value = gridColsMatch[1];
      if (value === 'none') {props.gridTemplateColumns = 'none';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.gridTemplateColumns = value.slice(1, -1);}
      else {props.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;}
      continue;
    }
    const gridRowsMatch = className.match(/^grid-rows-(\d+|none|\[.+\])$/);
    if (gridRowsMatch) {
      const value = gridRowsMatch[1];
      if (value === 'none') {props.gridTemplateRows = 'none';}
      else if (value.startsWith('[') && value.endsWith(']')) {props.gridTemplateRows = value.slice(1, -1);}
      else {props.gridTemplateRows = `repeat(${value}, minmax(0, 1fr))`;}
      continue;
    }
    const colSpanMatch = className.match(/^col-span-(\d+|full)$/);
    if (colSpanMatch) {
      const value = colSpanMatch[1];
      props.gridColumn = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }
    const rowSpanMatch = className.match(/^row-span-(\d+|full)$/);
    if (rowSpanMatch) {
      const value = rowSpanMatch[1];
      props.gridRow = value === 'full' ? '1 / -1' : `span ${value} / span ${value}`;
      continue;
    }
    const overflows: Record<string, string> = {
      'overflow-auto': 'auto', 'overflow-hidden': 'hidden', 'overflow-clip': 'clip',
      'overflow-visible': 'visible', 'overflow-scroll': 'scroll',
    };
    if (overflows[className]) { props.overflow = overflows[className]; continue; }
    const overflowX: Record<string, string> = {
      'overflow-x-auto': 'auto', 'overflow-x-hidden': 'hidden', 'overflow-x-clip': 'clip',
      'overflow-x-visible': 'visible', 'overflow-x-scroll': 'scroll',
    };
    if (overflowX[className]) { props.overflowX = overflowX[className]; continue; }
    const overflowY: Record<string, string> = {
      'overflow-y-auto': 'auto', 'overflow-y-hidden': 'hidden', 'overflow-y-clip': 'clip',
      'overflow-y-visible': 'visible', 'overflow-y-scroll': 'scroll',
    };
    if (overflowY[className]) { props.overflowY = overflowY[className]; continue; }
    const positions: Record<string, PositionType> = {
      static: 'static', fixed: 'fixed', absolute: 'absolute', relative: 'relative', sticky: 'sticky',
    };
    if (positions[className]) { props.position = positions[className]; continue; }
  }

  return props;
}
