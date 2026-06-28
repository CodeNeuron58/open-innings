import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes safely. Later classes override earlier conflicting ones.
 * Example: cn('p-2 text-red-500', condition && 'p-4') => 'text-red-500 p-4'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format overs as "12.3" — meaning 12 complete overs + 3 balls of the 13th over. */
export function formatOvers(ballsBowled: number): string {
  const completeOvers = Math.floor(ballsBowled / 6);
  const ballsInCurrentOver = ballsBowled % 6;
  return `${completeOvers}.${ballsInCurrentOver}`;
}

/** Format strike rate to 2 decimal places. Returns "—" if balls faced is 0. */
export function formatStrikeRate(runs: number, balls: number): string {
  if (balls === 0) return '—';
  return ((runs / balls) * 100).toFixed(2);
}

/** Format economy rate (runs per over) to 2 decimal places. */
export function formatEconomy(runs: number, ballsBowled: number): string {
  if (ballsBowled === 0) return '—';
  return ((runs / ballsBowled) * 6).toFixed(2);
}
