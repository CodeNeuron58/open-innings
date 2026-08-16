/**
 * The stored format label, in words.
 *
 * `matches.format` holds a short key so it can be filtered and compared;
 * screens want "T20". One map, because the list and the card both show it and
 * "T20" on one beside "t20" on the other looks like a bug.
 *
 * Null is a real answer — every match created before the column existed has
 * no label, and guessing one from the over count would be wrong. A 20-over
 * game is not necessarily a T20.
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
