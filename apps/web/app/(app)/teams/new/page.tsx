import Link from 'next/link';
import { listPlayers } from '@/lib/db/queries';
import { createTeamAction } from './actions';
import {
  Button,
  ButtonLink,
  Card,
  FormError,
  Input,
  Label,
  PageHeader,
  Monogram,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const players = await listPlayers().catch(() => []);

  return (
    <div className="container max-w-xl py-8">
      <PageHeader
        title="Add team"
        description="Name the side, then tick the squad members."
      />
      <FormError message={error} />
      <form action={createTeamAction}>
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <Label htmlFor="name">Team name</Label>
              <Input id="name" name="name" required placeholder="e.g. Boundary CC" />
            </div>
            <div>
              <Label htmlFor="shortName">Short name</Label>
              <Input id="shortName" name="shortName" placeholder="e.g. BCC" />
            </div>
          </div>
          <div>
            <Label htmlFor="homeGround">Home ground</Label>
            <Input id="homeGround" name="homeGround" placeholder="e.g. Shivaji Park" />
          </div>

          <div>
            <Label>Squad (optional)</Label>
            {players.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No players yet.{' '}
                <Link href="/players/new" className="font-medium text-primary hover:underline">
                  Add players first
                </Link>
                .
              </p>
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
                {players.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      name="playerIds"
                      value={p.id}
                      className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                    />
                    <Monogram name={p.fullName} className="h-7 w-7 text-[10px]" />
                    <span className="truncate">{p.fullName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="mt-5 flex gap-3">
          <Button type="submit" size="lg">
            Save team
          </Button>
          <ButtonLink href="/teams" variant="outline" size="lg">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
