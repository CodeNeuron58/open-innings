/**
 * The seed an innings replays from.
 *
 * Every path that reads the ball log rebuilds the same starting state: the
 * opening trio, the innings' caps, and the match conditions the deliveries
 * were validated under. It lived inside the ball route until correcting a
 * delivery needed it too — and two copies of this would be the worst kind of
 * duplication, because the copy that drifted would replay a *different*
 * innings from the same deliveries and nothing would say so.
 */
import { initialState, type MatchState } from '@open-innings/scoring';

export type SeedMatch = {
  id: string;
  oversPerInnings: number;
  teamAId: string;
  teamBId: string;
  maxOversPerBowler: number | null;
};

export type SeedInnings = {
  id: string;
  inningsNumber: number;
  battingTeamId: string;
  bowlingTeamId: string;
  openingStrikerId: string | null;
  openingNonStrikerId: string | null;
  openingBowlerId: string | null;
  target: number | null;
  maxWickets: number;
};

export function buildSeed(match: SeedMatch, currentInnings: SeedInnings): MatchState {
  // The opening trio seeds the pair and the bowler. Once a delivery is
  // recorded the engine's own state supersedes them; until then this is what
  // a fresh innings shows.
  return initialState({
    matchId: match.id,
    oversPerInnings: match.oversPerInnings,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    battingTeamId: currentInnings.battingTeamId,
    bowlingTeamId: currentInnings.bowlingTeamId,
    inningsId: currentInnings.id,
    inningsNumber: currentInnings.inningsNumber as 1 | 2 | 3 | 4,
    strikerId: currentInnings.openingStrikerId ?? '',
    nonStrikerId: currentInnings.openingNonStrikerId ?? '',
    bowlerId: currentInnings.openingBowlerId ?? '',
    target: currentInnings.target ?? undefined,
    maxWickets: currentInnings.maxWickets,
    // Null in the row means the match set no limit; the engine reads undefined
    // as unenforced. Replay must see the same condition the delivery was
    // validated under, or a lawfully-scored innings stops replaying.
    maxOversPerBowler: match.maxOversPerBowler ?? undefined,
  });
}
