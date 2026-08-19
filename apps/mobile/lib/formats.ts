/**
 * Human-readable format labels.
 * Returns null if the format is not explicitly stored.
 */
const LABELS: Record<string, string> = {
  t20: 'T20',
  odi: 'ODI',
  t10: 'T10',
  club: 'Club',
  gully: 'Gully',
};

export function formatLabel(format: string | null | undefined): string | null {
  if (!format) return null;
  return LABELS[format] ?? null;
}
