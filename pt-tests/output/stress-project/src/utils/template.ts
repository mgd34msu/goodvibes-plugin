export function createTemplate(name: string, value: unknown): string {
  return `Hello ${name}, your value is: ${value}`;
}

export const TEMPLATE_PATTERN = /`[^`]*\${[^}]+}[^`]*`/g;

export function parseTemplate(template: string): string[] {
  const matches = template.match(TEMPLATE_PATTERN);
  return matches || [];
}

export class TemplateEngine {
  private templates: Map<string, string> = new Map();

  register(name: string, template: string): void {
    if (template.includes("`")) {
      this.templates.set(name, template);
    }
  }

  render(name: string, context: Record<string, unknown>): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template "${name}" not found`);
    }

    // Replace ${variable} patterns with context values
    return template.replace(/\${(\w+)}/g, (match, key) => {
      return String(context[key] ?? match);
    });
  }
}
