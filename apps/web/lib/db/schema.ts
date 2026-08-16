/**
 * Open Innings — database schema (source of truth).
 *
 * Design philosophy:
 *  1. `ball_events` is the single source of truth for all scoring state.
 *     Scorecards, stats, leaderboards are DERIVED from ball events.
 *     This makes undo trivial, audits complete, and bugs debuggable.
 *  2. Every row has `createdAt` + audit-friendly `createdBy`.
 *  3. Soft references (no FK cascade on user-owned rows) — see GDPR notes
 *     in docs/architecture.md. Users can be anonymised without losing
 *     historical match data.
 *  4. RLS is configured separately in supabase/migrations/*.sql because
 *     Drizzle doesn't model Postgres RLS policies.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  smallint,
  boolean,
  date,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** How a player holds the bat. */
export const battingStyle = pgEnum('batting_style', ['right_hand', 'left_hand']);

/** How a player bowls. */
export const bowlingStyle = pgEnum('bowling_style', [
  'right_arm_fast',
  'left_arm_fast',
  'right_arm_medium',
  'left_arm_medium',
  'right_arm_spin',
  'left_arm_spin',
  'right_arm_off_break',
  'left_arm_orthodox',
  'leg_break',
  'googly',
  'none',
]);

/** Player role in a team. */
export const playerRole = pgEnum('player_role', [
  'batsman',
  'bowler',
  'all_rounder',
  'wicket_keeper',
  'wicket_keeper_batsman',
]);

/** Match status. */
export const matchStatus = pgEnum('match_status', [
  'scheduled',
  'live',
  'completed',
  'abandoned',
  'tied',
  'no_result',
]);

/** Toss decision. */
export const tossDecision = pgEnum('toss_decision', ['bat', 'bowl']);

/** Ball type — leather or tennis/synthetic. Affects runs/over count semantics. */
export const ballType = pgEnum('ball_type', ['leather', 'tennis', 'synthetic']);

/** Innings status. */
export const inningsStatus = pgEnum('innings_status', ['not_started', 'in_progress', 'completed']);

/**
 * Type of ball event. The heart of the scoring engine.
 * - dot..six: 0–6 runs off the bat (no extras)
 * - wide, no_ball: illegal deliveries, +1 penalty + any runs off bat
 * - bye, leg_bye: runs taken but NOT credited to batsman
 * - wicket: a wicket fell on this ball (always combined with one of the above)
 */
export const ballEventType = pgEnum('ball_event_type', [
  'dot',
  '1',
  '2',
  '3',
  '4',
  '6',
  'wide',
  'no_ball',
  'bye',
  'leg_bye',
  'wicket',
]);

/** Wicket dismissal types recognised by MCC Law 30 + common variants. */
export const wicketType = pgEnum('wicket_type', [
  'bowled',
  'caught',
  'caught_behind',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'handled_ball',
  'obstructing_field',
  'timed_out',
  'retired_hurt',
  'retired_out',
  'double_hit',
  'hit_the_ball_twice',
]);

/** Tournament format. */
export const tournamentType = pgEnum('tournament_type', [
  'round_robin',
  'knockout',
  'group_knockout',
  'custom',
]);

/** Tournament match result. Used to compute standings. */
export const tournamentResult = pgEnum('tournament_result', [
  'team_a_win',
  'team_b_win',
  'tie',
  'no_result',
  'abandoned',
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Users (mirrors auth.users — kept in sync via Supabase trigger)
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    // Local-auth id. Not tied to an external auth provider.
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    // Local-auth credentials. Argon2 hash + salt. Never sent to the client.
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // GDPR: when a user requests deletion, anonymise rather than hard-delete
    // so historical match records remain valid.
    anonymisedAt: timestamp('anonymised_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Players (cricket players — may or may not have a user account)
// ─────────────────────────────────────────────────────────────────────────────

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Optional link to a user account. Players can be created ad-hoc
    // (e.g. opponent's player) without an account.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    fullName: text('full_name').notNull(),
    shortName: text('short_name'), // e.g. "VK" for Virat Kohli
    dateOfBirth: date('date_of_birth'),
    battingStyle: battingStyle('batting_style'),
    bowlingStyle: bowlingStyle('bowling_style'),
    role: playerRole('role'),
    avatarUrl: text('avatar_url'),
    // Audit
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('players_user_idx').on(t.userId),
    nameIdx: index('players_name_idx').on(t.fullName),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Teams
// ─────────────────────────────────────────────────────────────────────────────

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    shortName: text('short_name'), // "IND", "RCB", "Star XI"
    homeGround: text('home_ground'),
    logoUrl: text('logo_url'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('teams_owner_idx').on(t.ownerId),
  }),
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    jerseyNumber: smallint('jersey_number'),
    isCaptain: boolean('is_captain').notNull().default(false),
    isWicketkeeper: boolean('is_wicket_keeper').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.playerId] }),
    playerIdx: index('team_members_player_idx').on(t.playerId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tournaments (v0.2 — schema in place from day 1)
// ─────────────────────────────────────────────────────────────────────────────

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: tournamentType('type').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    description: text('description'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdByIdx: index('tournaments_created_by_idx').on(t.createdBy),
  }),
);

export const tournamentTeams = pgTable(
  'tournament_teams',
  {
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    groupName: text('group_name'),
    seed: smallint('seed'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tournamentId, t.teamId] }),
    teamIdx: index('tournament_teams_team_idx').on(t.teamId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Matches
// ─────────────────────────────────────────────────────────────────────────────

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'), // e.g. "Mumbai T20 League Final"
    venue: text('venue'),
    oversPerInnings: smallint('overs_per_innings').notNull(), // 20, 50, etc.
    ballType: ballType('ball_type').notNull().default('leather'),
    status: matchStatus('status').notNull().default('scheduled'),

    teamAId: uuid('team_a_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    teamBId: uuid('team_b_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),

    tossWinnerTeamId: uuid('toss_winner_team_id').references(() => teams.id, {
      onDelete: 'set null',
    }),
    tossDecision: tossDecision('toss_decision'),

    tournamentId: uuid('tournament_id').references(() => tournaments.id, {
      onDelete: 'set null',
    }),

    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Result (set when match completes)
    result: tournamentResult('result'),
    winningTeamId: uuid('winning_team_id').references(() => teams.id, {
      onDelete: 'set null',
    }),
    summary: text('summary'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('matches_status_idx').on(t.status),
    teamAIdx: index('matches_team_a_idx').on(t.teamAId),
    teamBIdx: index('matches_team_b_idx').on(t.teamBId),
    tournamentIdx: index('matches_tournament_idx').on(t.tournamentId),
    createdByIdx: index('matches_created_by_idx').on(t.createdBy),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Innings
// ─────────────────────────────────────────────────────────────────────────────

export const innings = pgTable(
  'innings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    inningsNumber: smallint('innings_number').notNull(), // 1 or 2 for limited-overs
    battingTeamId: uuid('batting_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    bowlingTeamId: uuid('bowling_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),

    // Cached/derived state — also derivable from ball_events.
    // Kept here for query performance on the live scorecard.
    runs: integer('runs').notNull().default(0),
    wickets: integer('wickets').notNull().default(0),
    ballsBowled: integer('balls_bowled').notNull().default(0), // legal balls only
    extras: integer('extras').notNull().default(0),

    // For 2nd innings: the target score (first innings runs + 1)
    target: integer('target'),

    status: inningsStatus('status').notNull().default('not_started'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Engine seed state — the striker/non-striker/bowler that open this
    // innings. These are also derivable from the LAST ball_event row, but
    // we cache them so a fresh innings (before any balls) has a valid seed.
    openingStrikerId: uuid('opening_striker_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    openingNonStrikerId: uuid('opening_non_striker_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    openingBowlerId: uuid('opening_bowler_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    maxWickets: smallint('max_wickets').notNull().default(10), // 2 for Super Over
  },
  (t) => ({
    matchNumberIdx: uniqueIndex('innings_match_number_idx').on(t.matchId, t.inningsNumber),
    battingTeamIdx: index('innings_batting_team_idx').on(t.battingTeamId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Ball events — THE source of truth for all scoring
// ─────────────────────────────────────────────────────────────────────────────

export const ballEvents = pgTable(
  'ball_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inningsId: uuid('innings_id')
      .notNull()
      .references(() => innings.id, { onDelete: 'cascade' }),

    // Position in the over (1..6 for legal balls; may exceed for wides/no-balls
    // since they're re-bowled, but we still sequence them for ordering).
    overNumber: smallint('over_number').notNull(), // 0-indexed
    ballNumber: smallint('ball_number').notNull(), // sequence within innings

    eventType: ballEventType('event_type').notNull(),

    // Players on the field
    batsmanId: uuid('batsman_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    nonStrikerId: uuid('non_striker_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    bowlerId: uuid('bowler_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),

    // Runs breakdown
    runsOffBat: smallint('runs_off_bat').notNull().default(0), // 0..6
    extraRuns: smallint('extra_runs').notNull().default(0), // wides/no-balls/bye runs
    totalRuns: smallint('total_runs').notNull().default(0), // runsOffBat + extraRuns
    isLegalDelivery: boolean('is_legal_delivery').notNull().default(true),

    // Free hit context — set when this ball is a free hit (after a no-ball).
    // Used to validate the next ball's wicket.
    isFreeHit: boolean('is_free_hit').notNull().default(false),

    // Wicket details (if event_type = 'wicket' OR run-out happened off a ball)
    wicketType: wicketType('wicket_type'),
    wicketPlayerId: uuid('wicket_player_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    fielderId: uuid('fielder_id').references(() => players.id, {
      onDelete: 'set null',
    }),

    // Free text — scorer commentary
    commentary: text('commentary'),

    // Audit
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    inningsIdx: index('ball_events_innings_idx').on(t.inningsId, t.ballNumber),
    batsmanIdx: index('ball_events_batsman_idx').on(t.batsmanId),
    bowlerIdx: index('ball_events_bowler_idx').on(t.bowlerId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. Sessions — server-side session storage for local email/password auth
// ─────────────────────────────────────────────────────────────────────────────
// The client gets an opaque session token via a signed cookie. We store the
// token + user binding here so we can revoke, expire, and audit sessions.

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 of the cookie value
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
  }),
);

/**
 * People who asked to be told when the app is out.
 *
 * Deliberately not a `users` row: someone leaving an address on the landing
 * page has not created an account, and turning an email into a half-account
 * they never asked for is how a mailing list becomes a data-protection
 * problem.
 *
 * `source` records which page it came from, so a later decision about who to
 * contact — release notes, or testers for the closed track — can be made on
 * something other than a guess.
 */
export const notifySignups = pgTable(
  'notify_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stored lower-cased. Unique so a second submission is not a second row —
    // people tap twice, and the honest answer to that is "yes, you're on it".
    email: text('email').notNull().unique(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('notify_signups_created_idx').on(t.createdAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations (for Drizzle's relational query API)
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  ownedTeams: many(teams),
  createdPlayers: many(players),
  createdMatches: many(matches),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  user: one(users, { fields: [players.userId], references: [users.id] }),
  createdByUser: one(users, { fields: [players.createdBy], references: [users.id] }),
  teamMemberships: many(teamMembers),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, { fields: [teams.ownerId], references: [users.id] }),
  members: many(teamMembers),
  homeMatches: many(matches, { relationName: 'teamA' }),
  awayMatches: many(matches, { relationName: 'teamB' }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  player: one(players, { fields: [teamMembers.playerId], references: [players.id] }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  teamA: one(teams, { fields: [matches.teamAId], references: [teams.id], relationName: 'teamA' }),
  teamB: one(teams, { fields: [matches.teamBId], references: [teams.id], relationName: 'teamB' }),
  tossWinner: one(teams, {
    fields: [matches.tossWinnerTeamId],
    references: [teams.id],
  }),
  tournament: one(tournaments, { fields: [matches.tournamentId], references: [tournaments.id] }),
  innings: many(innings),
  createdByUser: one(users, { fields: [matches.createdBy], references: [users.id] }),
}));

export const inningsRelations = relations(innings, ({ one, many }) => ({
  match: one(matches, { fields: [innings.matchId], references: [matches.id] }),
  battingTeam: one(teams, {
    fields: [innings.battingTeamId],
    references: [teams.id],
  }),
  bowlingTeam: one(teams, {
    fields: [innings.bowlingTeamId],
    references: [teams.id],
  }),
  ballEvents: many(ballEvents),
}));

export const ballEventsRelations = relations(ballEvents, ({ one }) => ({
  innings: one(innings, { fields: [ballEvents.inningsId], references: [innings.id] }),
  batsman: one(players, { fields: [ballEvents.batsmanId], references: [players.id] }),
  nonStriker: one(players, { fields: [ballEvents.nonStrikerId], references: [players.id] }),
  bowler: one(players, { fields: [ballEvents.bowlerId], references: [players.id] }),
  wicketPlayer: one(players, {
    fields: [ballEvents.wicketPlayerId],
    references: [players.id],
    relationName: 'wicketPlayer',
  }),
  fielder: one(players, {
    fields: [ballEvents.fielderId],
    references: [players.id],
    relationName: 'fielder',
  }),
}));

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  createdByUser: one(users, { fields: [tournaments.createdBy], references: [users.id] }),
  matches: many(matches),
  teams: many(tournamentTeams),
}));

export const tournamentTeamsRelations = relations(tournamentTeams, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentTeams.tournamentId],
    references: [tournaments.id],
  }),
  team: one(teams, { fields: [tournamentTeams.teamId], references: [teams.id] }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Inferred TypeScript types — import these in app code
// ─────────────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type Innings = typeof innings.$inferSelect;
export type NewInnings = typeof innings.$inferInsert;
export type BallEvent = typeof ballEvents.$inferSelect;
export type NewBallEvent = typeof ballEvents.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type NotifySignup = typeof notifySignups.$inferSelect;
export type NewNotifySignup = typeof notifySignups.$inferInsert;

// Re-export sql helper for raw queries elsewhere
export { sql };
