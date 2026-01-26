export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseJSON(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to parse JSON');
    return null;
  }
}
