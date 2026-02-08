/**
 * Type declarations for turndown-plugin-gfm.
 * GitHub Flavored Markdown plugin for Turndown.
 *
 * @see https://github.com/mixmark-io/turndown-plugin-gfm
 */

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  /**
   * GitHub Flavored Markdown plugin for Turndown.
   * Adds support for:
   * - Tables (markdown table syntax)
   * - Strikethrough (~~text~~)
   * - Task lists (- [x] / - [ ])
   */
  export const gfm: TurndownService.Plugin;

  /**
   * Individual GFM sub-plugins.
   */
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
