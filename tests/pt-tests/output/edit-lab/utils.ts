export function formatDate(date: Date): string {
  return date.toISOString();
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-');
}
