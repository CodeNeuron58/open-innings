/**
 * In-app account deletion.
 * Explains what is deleted vs. kept, then requires a password to confirm.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../lib/api';
import { Button, ErrorBanner } from './ui';

type Stage = 'closed' | 'explaining' | 'confirming' | 'done';

export function DeleteAccount({
  token,
  email,
  onDeleted,
}: {
  token: string;
  email: string;
  /** Sign out and return to the welcome screen. The account is already gone. */
  onDeleted: () => void;
}) {
  const [stage, setStage] = useState<Stage>('closed');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<{
    matchesKept: number;
    teamsKept: number;
    playerReleased: boolean;
  } | null>(null);

  function close() {
    setStage('closed');
    setPassword('');
    setError(null);
  }

  async function submit() {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteAccount(token, password);
      setKept(result.kept);
      setStage('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/*
        On its own, at the very bottom, with nothing beside it. A destructive
        action sharing a row with ordinary settings is one mis-tap away from
        being irreversible.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete account"
        onPress={() => setStage('explaining')}
        className="border-wicket mt-8 border px-4 py-3 active:opacity-70"
      >
        <Text className="text-wicket font-heading text-center text-[11px] uppercase tracking-[1.4px]">
          Delete account
        </Text>
      </Pressable>

      {stage === 'closed' ? null : (
        <Modal visible transparent animationType="slide" onRequestClose={close}>
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-background border-border max-h-[88%] border-t-2 px-4 pb-4 pt-3.5">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-foreground font-heading min-w-0 flex-1 text-[21px]">
                  {stage === 'done' ? 'Account deleted' : 'Delete your account'}
                </Text>
                {stage === 'done' ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    onPress={close}
                    className="shrink-0 px-1 py-1 active:opacity-60"
                  >
                    <Text className="font-heading text-[11px] uppercase tracking-[1.4px] text-neutral-600">
                      Cancel
                    </Text>
                  </Pressable>
                )}
              </View>

              <ScrollView className="mt-4" contentContainerClassName="gap-4 pb-1">
                {error ? <ErrorBanner message={error} /> : null}

                {stage === 'explaining' ? (
                  <>
                    <View>
                      <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
                        Erased, immediately
                      </Text>
                      <Text className="text-foreground/80 mt-2 text-[13.5px] leading-[19px]">
                        Your email address, your name, your password, and every device signed in to
                        this account. There is no waiting period and no way back.
                      </Text>
                    </View>

                    <View>
                      <Text className="font-heading text-[9.5px] uppercase tracking-[1.5px] text-neutral-600">
                        Kept
                      </Text>
                      <Text className="text-foreground/80 mt-2 text-[13.5px] leading-[19px]">
                        Every match you scored, and the squads you made. A match has two sides —
                        deleting it would take innings out of the careers of everyone else who
                        played, and their record is not yours or ours to remove.
                      </Text>
                      <Text className="text-foreground/80 mt-2 text-[13.5px] leading-[19px]">
                        What goes is every trace of who recorded it. The scorecards stay; nothing on
                        them says you.
                      </Text>
                    </View>

                    <Text className="text-foreground/60 text-[12px] leading-[17px]">
                      Want your own copy first? Export any match as CSV or JSON before you do this.
                    </Text>

                    <Button label="Continue" onPress={() => setStage('confirming')} />
                  </>
                ) : null}

                {stage === 'confirming' ? (
                  <>
                    <Text className="text-foreground/80 text-[13.5px] leading-[19px]">
                      Enter the password for {email} to confirm. Being signed in on this phone is
                      not proof of who is holding it.
                    </Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="current-password"
                      placeholder="Password"
                      accessibilityLabel="Password"
                      editable={!busy}
                      className="text-foreground border-input h-12 border bg-neutral-100 px-4 font-sans text-base"
                    />
                    <Button
                      label="Delete my account"
                      variant="destructive"
                      loading={busy}
                      disabled={!password || busy}
                      onPress={() => void submit()}
                    />
                  </>
                ) : null}

                {stage === 'done' ? (
                  <>
                    <Text className="text-foreground/80 text-[13.5px] leading-[19px]">
                      Your account is gone and every device has been signed out. Nothing left points
                      at you.
                    </Text>
                    {kept ? (
                      <Text className="text-foreground/80 text-[13.5px] leading-[19px]">
                        {kept.matchesKept > 0
                          ? `${kept.matchesKept} ${kept.matchesKept === 1 ? 'match' : 'matches'} `
                          : 'The matches '}
                        and {kept.teamsKept > 0 ? `${kept.teamsKept} ` : ''}
                        {kept.teamsKept === 1 ? 'squad stay' : 'squads stay'} where they are, with
                        no record of who scored them.
                        {kept.playerReleased
                          ? ' Your player page is no longer linked to an account.'
                          : ''}
                      </Text>
                    ) : null}
                    <Button label="Close" onPress={onDeleted} />
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
