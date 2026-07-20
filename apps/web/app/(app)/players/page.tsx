import { Plus, Users } from 'lucide-react';
import { listPlayers } from '@/lib/db/queries';
import {
  ButtonLink,
  Card,
  PageHeader,
  EmptyState,
  Monogram,
  Badge,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const roleLabels: Record<string, string> = {
  batsman: 'Batter',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  wicket_keeper: 'Wicket-keeper',
  wicket_keeper_batsman: 'WK-batter',
};

const styleLabels: Record<string, string> = {
  right_hand: 'RHB',
  left_hand: 'LHB',
  right_arm_fast: 'RF',
  left_arm_fast: 'LF',
  right_arm_medium: 'RM',
  left_arm_medium: 'LM',
  right_arm_spin: 'ROS',
  left_arm_spin: 'LOS',
  right_arm_off_break: 'OB',
  left_arm_orthodox: 'SLA',
  leg_break: 'LB',
  googly: 'LBG',
};

export default async function PlayersPage() {
  let players: Awaited<ReturnType<typeof listPlayers>> = [];
  let dbError: string | null = null;
  try {
    players = await listPlayers();
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }

  return (
    <div className="container py-8">
      <PageHeader
        title="Players"
        description="Your player database — every innings adds to their career."
        action={
          <ButtonLink href="/players/new">
            <Plus className="h-4 w-4" /> Add player
          </ButtonLink>
        }
      />

      {dbError ? (
        <Card className="border-extra/40 bg-extra/10 p-4 text-sm">
          <strong>Database not configured.</strong> Set <code>DATABASE_URL</code> in{' '}
          <code>.env.local</code> and run the migrations. ({dbError})
        </Card>
      ) : players.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No players yet"
          hint="Add the people who'll bat and bowl — a name is enough to get going."
          action={
            <ButtonLink href="/players/new" size="sm">
              <Plus className="h-4 w-4" /> Add your first player
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => {
            const styles = [
              p.battingStyle ? styleLabels[p.battingStyle] : null,
              p.bowlingStyle && p.bowlingStyle !== 'none' ? styleLabels[p.bowlingStyle] : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Card
                key={p.id}
                className="flex items-center gap-3 p-4 transition-shadow hover:shadow-card-hover"
              >
                <Monogram name={p.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.shortName ? `${p.shortName}` : ''}
                    {p.shortName && styles ? ' · ' : ''}
                    {styles || (!p.shortName ? '—' : '')}
                  </p>
                </div>
                {p.role && <Badge variant="secondary">{roleLabels[p.role] ?? p.role}</Badge>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
