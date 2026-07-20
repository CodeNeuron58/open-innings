'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createPlayer } from '@/lib/db/queries';

/** User-facing failures redirect back to the form — never the error page. */
function fail(message: string): never {
  redirect(`/players/new?error=${encodeURIComponent(message)}`);
}

export async function createPlayerAction(formData: FormData): Promise<void> {
  const fullName = (formData.get('fullName') as string)?.trim();
  if (!fullName) {
    fail('Full name is required');
  }

  const shortName = (formData.get('shortName') as string)?.trim() || undefined;
  const battingStyle = (formData.get('battingStyle') as 'right_hand' | 'left_hand') || undefined;
  const bowlingStyle =
    ((formData.get('bowlingStyle') as string) || undefined) as
      | 'right_arm_fast'
      | 'left_arm_fast'
      | 'right_arm_medium'
      | 'left_arm_medium'
      | 'right_arm_spin'
      | 'left_arm_spin'
      | 'right_arm_off_break'
      | 'left_arm_orthodox'
      | 'leg_break'
      | 'googly'
      | 'none'
      | undefined;
  const role = (formData.get('role') as string) || undefined;

  const player = await createPlayer({
    fullName,
    shortName,
    battingStyle,
    bowlingStyle,
    role: role as
      | 'batsman'
      | 'bowler'
      | 'all_rounder'
      | 'wicket_keeper'
      | 'wicket_keeper_batsman'
      | undefined,
  });

  if (!player) {
    fail('Could not create player — make sure you are signed in');
  }

  revalidatePath('/players');
  redirect('/players');
}