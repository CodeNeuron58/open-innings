-- What a match calls itself.
--
-- A label, not a rule. `overs_per_innings` is what the scoring engine reads,
-- and every supported format is the same engine with a different number in
-- that column. This exists so a card can say "T20" instead of "20 overs", and
-- so a club can filter a season later.
--
-- Text rather than an enum, deliberately. The set of names a club uses for its
-- own competitions is theirs, not ours, and a pgEnum would make adding one a
-- migration. The application constrains it (MATCH_FORMATS in
-- packages/shared/src/enums.ts); the database only stores it.
--
-- Nullable, because every match that already exists has no answer. Deriving
-- one from the over count would be a guess: a 20-over game is not necessarily
-- a T20, and a wrong label on a finished match is worse than no label.

alter table matches add column if not exists format text;
