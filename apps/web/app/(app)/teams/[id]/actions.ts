'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { updateTeamSchema, teamMemberSchema } from '@open-innings/shared';
import {
  updateOwnedTeam,
  addMemberToOwnedTeam,
  removeMemberFromOwnedTeam,
} from '@/lib/services/squads';
import { formValues, parseForm, redirectWithError } from '@/lib/api/form';

export async function updateTeamAction(teamId: string, formData: FormData): Promise<void> {
  const page = `/teams/${teamId}`;

  const input = parseForm(
    updateTeamSchema,
    formValues(formData, ['name', 'shortName', 'homeGround']),
    page,
  );

  try {
    await updateOwnedTeam(teamId, input);
  } catch (error) {
    redirectWithError(page, error);
  }

  revalidatePath(page);
  revalidatePath('/teams');
  redirect(page);
}

export async function addTeamMemberAction(teamId: string, formData: FormData): Promise<void> {
  const page = `/teams/${teamId}`;

  const { playerId } = parseForm(teamMemberSchema, formValues(formData, ['playerId']), page);

  try {
    await addMemberToOwnedTeam(teamId, playerId);
  } catch (error) {
    redirectWithError(page, error);
  }

  revalidatePath(page);
  redirect(page);
}

export async function removeTeamMemberAction(teamId: string, playerId: string): Promise<void> {
  const page = `/teams/${teamId}`;

  try {
    await removeMemberFromOwnedTeam(teamId, playerId);
  } catch (error) {
    redirectWithError(page, error);
  }

  revalidatePath(page);
  redirect(page);
}
