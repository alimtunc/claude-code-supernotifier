export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value == null ? '' : String(value);
  });
}

export function truncate(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}
