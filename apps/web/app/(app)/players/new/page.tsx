import { createPlayerAction } from './actions';
import {
  Button,
  ButtonLink,
  Card,
  FormError,
  Input,
  Label,
  PageHeader,
  Select,
} from '@/components/ui';

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="container max-w-xl py-8">
      <PageHeader
        title="Add player"
        description="A name is all that's required — everything else is optional."
      />
      <FormError message={error} />
      <form action={createPlayerAction}>
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" required placeholder="e.g. Virat Kohli" />
            </div>
            <div>
              <Label htmlFor="shortName">Short name</Label>
              <Input id="shortName" name="shortName" placeholder="e.g. VK" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="battingStyle">Batting style</Label>
              <Select id="battingStyle" name="battingStyle">
                <option value="">—</option>
                <option value="right_hand">Right hand</option>
                <option value="left_hand">Left hand</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="bowlingStyle">Bowling style</Label>
              <Select id="bowlingStyle" name="bowlingStyle">
                <option value="">—</option>
                <option value="right_arm_fast">Right arm fast</option>
                <option value="left_arm_fast">Left arm fast</option>
                <option value="right_arm_medium">Right arm medium</option>
                <option value="left_arm_medium">Left arm medium</option>
                <option value="right_arm_spin">Right arm spin</option>
                <option value="left_arm_spin">Left arm spin</option>
                <option value="right_arm_off_break">Right arm off break</option>
                <option value="left_arm_orthodox">Left arm orthodox</option>
                <option value="leg_break">Leg break</option>
                <option value="googly">Googly</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role">
              <option value="">—</option>
              <option value="batsman">Batter</option>
              <option value="bowler">Bowler</option>
              <option value="all_rounder">All-rounder</option>
              <option value="wicket_keeper">Wicket-keeper</option>
              <option value="wicket_keeper_batsman">WK-batter</option>
            </Select>
          </div>
        </Card>

        <div className="mt-5 flex gap-3">
          <Button type="submit" size="lg">
            Save player
          </Button>
          <ButtonLink href="/players" variant="outline" size="lg">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
