/**
 * Zod schemas for every API input.
 *
 * One definition, two consumers: route handlers validate incoming JSON with
 * these, and the mobile client builds request bodies from the inferred types.
 * A field renamed here breaks compilation on both sides at once, which is the
 * entire point — a REST boundary is exactly where client and server silently
 * drift apart.
 *
 * Error messages here are user-facing. They surface directly in form errors
 * on web and in toasts on mobile, so write them for a person, not a log.
 */
import { z } from 'zod';
import {
  BATTING_STYLES,
  BOWLING_STYLES,
  PLAYER_ROLES,
  MATCH_FORMATS,
  TOSS_DECISIONS,
  BALL_EVENT_TYPES,
  WICKET_TYPES,
} from './enums';

/**
 * Deliberately permissive: anything with an `@` and no whitespace.
 *
 * `z.string().email()` rejects the single-label hostnames used by dev seeds
 * and local fixtures. Real deliverability is proven by sending mail, not by
 * a regex, so a stricter pattern here would buy nothing and break seeding.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter a valid email')
  .regex(/^[^@\s]+@[^@\s]+$/, 'Enter a valid email');

/**
 * A database id.
 *
 * Every `id` column in the schema is `uuid(...).primaryKey().defaultRandom()`,
 * so Postgres generates these and nothing else does. This used to be
 * `z.string().min(1)` on the stated grounds that ids came from nanoid — they
 * never have; `nanoid` is a declared dependency that `apps/web` does not
 * import anywhere.
 *
 * The cost of the loose version was not theoretical. Anything that parsed as
 * a non-empty string reached Postgres as a uuid comparison, raised `22P02
 * invalid input syntax for type uuid`, and came back as a 500 rather than the
 * 400 or 404 it was. Validating the shape here turns that whole class into a
 * clean rejection before a query is built.
 */
const idSchema = z.string().trim().uuid('Not a valid id');

/**
 * Is this string shaped like one of our ids?
 *
 * Exported because a **page** needs the same answer a route body does, and
 * getting it a different way is how the two drift. `/m/[matchId]` happened to
 * survive a malformed id because it catches everything and calls `notFound`;
 * `/p/[playerId]` and `/c/[teamId]` only convert a ServiceError 404, so a
 * Postgres `22P02 invalid input syntax for type uuid` rethrew and became a
 * 500 — on the two public URLs that get shared most.
 *
 * Checking the shape beats catching everything: a catch-all would also turn a
 * real database outage into "not found", which is a worse lie than a 500.
 */
export function isId(value: string): boolean {
  return idSchema.safeParse(value).success;
}

/** Optional free text: blank strings collapse to undefined so the DB stores NULL. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * The password rule, in one place.
 *
 * Extracted from `signupSchema` when password reset arrived. A reset that
 * accepted a weaker password than signup would not be an exception to the
 * rule, it would be the way around it — and two copies of a minimum length is
 * exactly the kind of thing that drifts by one character and is never noticed.
 */
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export const createPlayerSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(120),
  shortName: optionalText(40),
  battingStyle: z.enum(BATTING_STYLES).optional(),
  bowlingStyle: z.enum(BOWLING_STYLES).optional(),
  role: z.enum(PLAYER_ROLES).optional(),
});
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(80),
  shortName: optionalText(16),
  homeGround: optionalText(120),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const teamMemberSchema = z.object({
  playerId: idSchema,
});
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

/**
 * The three opening players every innings needs.
 *
 * Squad membership is *not* checked here — that needs a database round trip,
 * so the route handler re-verifies it. Schemas prove shape, not authority.
 */
export const openersSchema = z
  .object({
    openingStrikerId: idSchema,
    openingNonStrikerId: idSchema,
    openingBowlerId: idSchema,
  })
  .refine((v) => v.openingStrikerId !== v.openingNonStrikerId, {
    message: 'Striker and non-striker must be different players',
    path: ['openingNonStrikerId'],
  });
export type OpenersInput = z.infer<typeof openersSchema>;

export const createMatchSchema = z
  .object({
    title: optionalText(120),
    venue: optionalText(120),
    oversPerInnings: z.coerce
      .number()
      .int('Overs must be a whole number')
      .min(1, 'Overs must be a positive number')
      .max(200),
    /** A label the match wears. Optional — an unlabelled match still scores. */
    format: z.enum(MATCH_FORMATS).optional(),
    /**
     * How many overs one bowler may bowl.
     *
     * Three-way on purpose. Omitted means "apply the competition's usual
     * rule", and the server works it out from the over count and the squad —
     * it is the only party that knows whether the bowling side can actually
     * cover the innings under it. Explicit `null` means no limit, which gully
     * and box cricket need. A number is that number.
     */
    maxOversPerBowler: z.coerce.number().int().min(1).max(200).nullable().optional(),
    teamAId: idSchema,
    teamBId: idSchema,
    tossWinnerTeamId: idSchema.optional(),
    tossDecision: z.enum(TOSS_DECISIONS).optional(),
    openingStrikerId: idSchema,
    openingNonStrikerId: idSchema,
    openingBowlerId: idSchema,
  })
  .refine((v) => v.teamAId !== v.teamBId, {
    message: 'Pick two different teams',
    path: ['teamBId'],
  })
  .refine((v) => v.openingStrikerId !== v.openingNonStrikerId, {
    message: 'Striker and non-striker must be different players',
    path: ['openingNonStrikerId'],
  })
  .refine(
    // A toss is all-or-nothing: a winner without a decision tells us nothing
    // about who bats, and silently defaulting would put the wrong side in.
    (v) => (v.tossWinnerTeamId === undefined) === (v.tossDecision === undefined),
    { message: 'Record both the toss winner and their decision', path: ['tossDecision'] },
  )
  .refine(
    (v) =>
      v.tossWinnerTeamId === undefined ||
      v.tossWinnerTeamId === v.teamAId ||
      v.tossWinnerTeamId === v.teamBId,
    { message: 'The toss winner must be one of the two teams', path: ['tossWinnerTeamId'] },
  );
export type CreateMatchInput = z.infer<typeof createMatchSchema>;

/**
 * Any innings after the first needs openers only.
 *
 * Which innings it is, which way round the sides go, and what the target is
 * are all derived from what has already been played — the client does not get
 * to assert any of them. Named for the second innings when that was the only
 * one that could be started; a super over is innings 3 and 4 and takes exactly
 * the same three players.
 */
export const startNextInningsSchema = openersSchema;
export type StartNextInningsInput = z.infer<typeof startNextInningsSchema>;

/** @deprecated Use `startNextInningsSchema`. */
export const startSecondInningsSchema = startNextInningsSchema;
/** @deprecated Use `StartNextInningsInput`. */
export type StartSecondInningsInput = StartNextInningsInput;

/**
 * What can be changed about a match after it has been created.
 *
 * Deliberately narrow. The teams cannot move — every ball already recorded
 * names players from the squads that were chosen — and neither can the toss,
 * because `resolveBattingSides` read it once to decide who batted and the
 * innings rows carry that answer.
 *
 * `oversPerInnings` is the one that is load-bearing rather than cosmetic: the
 * engine ends an innings on it, so changing it re-decides whether an innings
 * that has already been scored is over. The service recomputes and only
 * permits it while the match is live.
 */
export const updateMatchSchema = z
  .object({
    title: optionalText(120),
    venue: optionalText(120),
    format: z.enum(MATCH_FORMATS).optional(),
    oversPerInnings: z.coerce.number().int().min(1).max(200).optional(),
    maxOversPerBowler: z.coerce.number().int().min(1).max(200).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to change',
  });
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;

/**
 * The two facts that belong to a squad membership rather than to a person.
 *
 * Somebody captains one club and bats at six for another, so captaincy and
 * keeping live on the membership. Both columns have existed since the first
 * migration and nothing has ever written them, which is why every squad in the
 * system has no captain and no keeper.
 *
 * Each field is tri-state: absent leaves it alone, so setting a jersey number
 * does not silently strip a captaincy.
 */
export const updateTeamMemberSchema = z
  .object({
    playerId: idSchema,
    isCaptain: z.boolean().optional(),
    isWicketkeeper: z.boolean().optional(),
    /** Null clears it. Two digits is the convention; three is allowed. */
    jerseyNumber: z.coerce.number().int().min(0).max(999).nullable().optional(),
  })
  .refine(
    (v) =>
      v.isCaptain !== undefined || v.isWicketkeeper !== undefined || v.jerseyNumber !== undefined,
    { message: 'Nothing to change' },
  );
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

// ---------------------------------------------------------------------------
// Ball events
// ---------------------------------------------------------------------------

/**
 * A single delivery, exactly as the scorer sends it.
 *
 * This is the wire shape of `BallEventInput` from @open-innings/scoring, and
 * it had to be rewritten: the previous version described a request nobody
 * makes — `{ type, runs, isWicket }` — and was never imported anywhere, so the
 * ball endpoint had been casting raw JSON with `as BallEventInput` since it
 * was written. A schema that does not match the traffic is worse than none,
 * because it reads like a guarantee.
 *
 * Shape only. Whether this bowler may bowl this over, and whether that batter
 * is even in, are the engine's business — it throws `ScoringError` for
 * anything it rejects. Do not restate cricket law here.
 *
 * ## What is deliberately absent
 *
 * `isFreeHit`, `isLegalDelivery`, `totalRuns` and `id` are **not** accepted.
 * Zod strips unknown keys, so a client sending them is ignored rather than
 * refused, and the engine derives all four itself. That is not tidiness:
 *
 *   - `isFreeHit: false` on the ball after a no-ball would let a client
 *     record a bowled dismissal that Law 21.18 forbids;
 *   - `isLegalDelivery: false` on a normal delivery would stop the over ever
 *     advancing;
 *   - a `totalRuns` disagreeing with its own parts would put any number on
 *     the board.
 *
 * Every one of those was reachable while the endpoint cast instead of parsed.
 */
export const ballEventSchema = z.object({
  /** Ignored by the server, which uses the innings the match is actually on. */
  inningsId: idSchema.optional(),

  eventType: z.enum(BALL_EVENT_TYPES),
  /**
   * Off the bat, 0..6.
   *
   * `z.number()` and not `z.coerce.number()`. Coercion runs `Number()`, which
   * turns `null` into 0, `true` into 1, `[]` into 0 and `[4]` into 4 — so a
   * malformed body would have recorded a wrong delivery with a 200 instead of
   * being refused, which is the exact failure this schema was wired up to
   * stop. Every caller (the app and all three smoke scripts) sends real
   * numbers, so there is nothing to coerce.
   */
  runsOffBat: z.number().int().min(0).max(6),
  /** Overthrow runs — physically run after a deflection (Law 18.6/19.8). Excluded from batter stats. */
  overthrowRuns: z.number().int().min(0).max(12).optional().default(0),
  /** Penalties plus byes. Well above anything real, but bounded. */
  extraRuns: z.number().int().min(0).max(12),

  batsmanId: idSchema,
  nonStrikerId: idSchema,
  bowlerId: idSchema,

  wicketType: z.enum(WICKET_TYPES).optional(),
  wicketPlayerId: idSchema.optional(),
  fielderId: idSchema.optional(),

  /**
   * Law 17.4 — the bowler changed part-way through this over because the
   * previous one could not continue.
   *
   * Accepted from the client, unlike the other server-owned flags above,
   * because it is a fact only the scorer knows: nothing in the ball log can
   * distinguish an injury from a mis-tap. It is refused by default and has to
   * be asserted, which is the right way round — the common case is the error.
   */
  bowlerReplacedMidOver: z.boolean().optional(),

  commentary: optionalText(280),

  /**
   * One delivery's id, minted by the client and resent unchanged on retry.
   *
   * The server derives `ballNumber` from the stored log, which cannot survive
   * a retry: the first attempt succeeded, the response was lost, and the
   * re-read now returns one more ball than before, so the retry computes the
   * *next* number and records the delivery twice. The unique index on
   * (innings_id, ball_number) never sees a conflict, because there genuinely
   * is not one.
   *
   * Anything that distinguishes a retry from a new ball has to come from the
   * side that knows which it is. Optional so an older client keeps scoring —
   * without the protection, which is what it has today either way.
   */
  requestId: idSchema.optional(),
});
export type BallEventBody = z.infer<typeof ballEventSchema>;

/**
 * The event type and the runs have to describe the same delivery.
 *
 * Shape alone let `{ eventType: 'wide', runsOffBat: 6 }` and
 * `{ eventType: '6', runsOffBat: 0 }` both through. Neither is a delivery
 * that can happen, and both persist happily — leaving the ball chip on the
 * card saying one thing and the score saying another, with no error anywhere
 * to explain it.
 *
 * This is not cricket law, which stays in the engine. It is the narrower
 * claim that a payload must be internally consistent before anyone reasons
 * about it.
 */
const RUNS_FOR_TYPE: Partial<Record<(typeof BALL_EVENT_TYPES)[number], number>> = {
  dot: 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
};

/** Types that carry a penalty or come off something other than the bat. */
const EXTRA_TYPES = new Set(['wide', 'no_ball', 'bye', 'leg_bye', 'penalty']);

type BallShape = {
  eventType: (typeof BALL_EVENT_TYPES)[number];
  runsOffBat: number;
  overthrowRuns?: number;
  extraRuns: number;
};

/**
 * Shared by POST (record) and PATCH (correct), because a correction has to be
 * as internally consistent as the delivery it replaces. Extracted from
 * `consistentBallEventSchema` when PATCH arrived — two copies of this would
 * drift, and the half that drifted would be the one writing to the ball log.
 */
const refineBallConsistency = (v: BallShape, ctx: z.RefinementCtx): void => {
  const expected = RUNS_FOR_TYPE[v.eventType];

  // A scoring shot names its own runs, and carries no extras.
  if (expected !== undefined) {
    if (v.runsOffBat !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runsOffBat'],
        message: `A '${v.eventType}' is ${expected} off the bat, not ${v.runsOffBat}`,
      });
    }
    if (v.extraRuns !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extraRuns'],
        message: `A '${v.eventType}' carries no extras`,
      });
    }
    return;
  }

  if (EXTRA_TYPES.has(v.eventType)) {
    // Every one of these puts at least one run on the board: a penalty for a
    // wide or no-ball, and a completed run for a bye or leg-bye.
    if (v.extraRuns < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extraRuns'],
        message: `A '${v.eventType}' scores at least one extra`,
      });
    }
    // Only a no-ball can be struck; the others never touched the bat.
    if (v.eventType !== 'no_ball' && v.runsOffBat !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runsOffBat'],
        message: `A '${v.eventType}' is never off the bat`,
      });
    }
  }

  // 'wicket' is left alone: a run-out can happen after any number of runs.
};

export const consistentBallEventSchema = ballEventSchema.superRefine(refineBallConsistency);

/**
 * A correction to a delivery already in the log — `PATCH .../ball/[ballId]`.
 *
 * It is a **replacement, not a partial update**: an absent `wicketType` means
 * the delivery no longer carries a wicket. Partial semantics would make
 * "remove the wicket I recorded by mistake" unexpressible, and that is one of
 * the two corrections scorers actually need.
 *
 * The batters are the exception, and they are optional for a reason. Who was
 * on strike is **derived** from everything before this ball, so a correction
 * that changes the runs also changes the strike — and asking the client to
 * send a pair it cannot know yet would make every such correction a guess.
 * Absent, the server derives them. Present, they are taken as the scorer's
 * assertion, which is what naming the wrong incoming batter after a wicket
 * needs.
 */
export const patchBallSchema = ballEventSchema
  .omit({ inningsId: true, batsmanId: true, nonStrikerId: true })
  .extend({
    batsmanId: idSchema.optional(),
    nonStrikerId: idSchema.optional(),
  })
  .superRefine(refineBallConsistency)
  .superRefine((v, ctx) => {
    // Naming one end without the other says nothing: the engine needs a pair,
    // and half a pair silently derives the other end into a position the
    // scorer did not choose.
    if ((v.batsmanId === undefined) !== (v.nonStrikerId === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nonStrikerId'],
        message: 'Name both batters or neither — half a pair is not a correction',
      });
    }
  });
export type PatchBallInput = z.infer<typeof patchBallSchema>;

/** The bowler taking the next over, sent when the scorer closes an over. */
export const changeBowlerSchema = z.object({
  bowlerId: idSchema,
});
export type ChangeBowlerInput = z.infer<typeof changeBowlerSchema>;

/** The batter walking in after a wicket, and which end they take. */
export const nextBatterSchema = z.object({
  playerId: idSchema,
  slot: z.enum(['striker', 'non_striker']),
});
export type NextBatterInput = z.infer<typeof nextBatterSchema>;

// ---------------------------------------------------------------------------
// Player identity across accounts
// ---------------------------------------------------------------------------

/**
 * Searching every player in Open Innings, not only your own.
 *
 * The whole claim of the product is that a career follows a person between
 * clubs. It could not: `listPlayers` scoped to `createdBy`, so two clubs
 * scoring the same cricketer built two half-careers that nothing could join.
 *
 * A global search exposes nothing new — every career page at `/p/<id>` is
 * already public and unauthenticated, and is the thing people share. What it
 * adds is the ability to *find* the page before creating a second one.
 *
 * Two guards, both here rather than in the route so the mobile client sees the
 * same rules: a minimum length, so this is a lookup and not an enumeration,
 * and a bounded page size.
 */
export const playerSearchSchema = z.object({
  q: z.string().trim().min(2, 'Type at least two letters to search'),
  scope: z.enum(['mine', 'all']).default('mine'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PlayerSearchInput = z.infer<typeof playerSearchSchema>;

/**
 * Fold a duplicate player row into the one that should survive.
 *
 * `duplicateId` is the row that disappears; the id in the path is the one that
 * keeps its career. Every reference in `ball_events`, `team_members` and the
 * innings' opening trio moves across, so the merged career is the sum of both
 * — which is only true if it happens in one transaction.
 *
 * `confirm` is not ceremony. A merge rewrites the ball log, and the ball log
 * is the only record there is; there is no undo for it, so the client has to
 * say plainly that it means to.
 */
export const mergePlayersSchema = z.object({
  duplicateId: idSchema,
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'A merge rewrites the ball log and cannot be undone' }),
  }),
});
export type MergePlayersInput = z.infer<typeof mergePlayersSchema>;

// ---------------------------------------------------------------------------
// Confirming an address, and recovering an account
// ---------------------------------------------------------------------------

/**
 * Ask for a password-reset link.
 *
 * The email is validated for shape only. Whether it has an account is never
 * disclosed — the response is identical either way — so there is nothing else
 * to check here.
 */
export const requestResetSchema = z.object({
  email: emailSchema,
});
export type RequestResetInput = z.infer<typeof requestResetSchema>;

/**
 * Spend a reset link and set a new password.
 *
 * The same password rule as signup, and enforced in the same place, because a
 * reset that accepted a weaker password than signup would be the way around
 * the rule rather than an exception to it.
 */
export const confirmResetSchema = z.object({
  token: z.string().trim().min(1),
  password: passwordSchema,
});
export type ConfirmResetInput = z.infer<typeof confirmResetSchema>;

/**
 * Confirm an address with the six-digit code from the message.
 *
 * A code rather than a link because this happens on a phone, seconds after
 * signing up, on the screen somebody wants to start scoring from. A link
 * sends them out to a mail client and hopes they come back.
 *
 * Exactly six digits, and nothing else accepted. Trimmed because people paste
 * with a trailing space out of a notification; not otherwise cleaned, since
 * `1 2 3 4 5 6` is a paste that went wrong rather than a code.
 */
export const confirmEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Enter the six digits from the email'),
});
export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;

/**
 * Delete your own account.
 *
 * The password is asked for again, on an action that cannot be undone and
 * that anybody holding an unlocked phone could otherwise reach in three taps.
 * It is the same reasoning as a bank asking before a transfer: the session
 * proves who signed in, not who is holding the device now.
 *
 * `confirm` is separate from the password because they answer different
 * questions — *are you who you say* and *do you mean this*. A single field
 * would let a client satisfy both by accident.
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Deleting an account cannot be undone' }),
  }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
