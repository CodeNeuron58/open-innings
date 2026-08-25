-- Migration 0020: did the batters cross?
--
-- Strike rotation is derived from run parity: an odd number of runs swaps the
-- ends, an over swaps them, and both together cancel. That is right almost
-- always, and `shouldSwapStrike` gets it right for every ordinary delivery.
--
-- It cannot be right always, because parity is not the whole truth:
--
--   A run out. Two batters set off, one is sent back, and the ball goes to the
--   other end — nought runs completed, but they crossed. Or they completed two
--   and were run out coming back, so the runs are even and they did cross. The
--   scorer watched it; the run count did not.
--
--   A bye or a leg bye where the throw comes in and they turn. Same problem.
--
--   A dismissal on which the incoming batter takes the striker's end or the
--   other one, depending on where the wicket fell.
--
-- Without a way to say so, the app puts the wrong batter on strike and every
-- delivery after it is credited to the wrong person. Nothing objects — the
-- innings is internally consistent, just about a different match — and the
-- scorer's only recourse is undoing back to the ball that did it.
--
-- Null means "work it out", which is what every delivery already recorded
-- means and what almost every future one will mean too. True and false are the
-- scorer overruling the arithmetic, and they are only ever set deliberately.

ALTER TABLE ball_events
  ADD COLUMN IF NOT EXISTS batters_crossed boolean;

COMMENT ON COLUMN ball_events.batters_crossed IS
  'Scorer override for strike rotation. NULL derives it from run parity.';
