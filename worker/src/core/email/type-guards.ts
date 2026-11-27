/** Canonical object guard for the email module: narrows unknown input (stored metadata JSON, route bodies) to a record. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
