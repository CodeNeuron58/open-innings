/**
 * A5 — Who are you on the field?
 *
 * ⚠️ NOT WIRED. The fields are complete; nothing is saved.
 *
 * Three of them have nowhere to go yet. `players` carries a name, a role and
 * batting/bowling styles, but a player is not linked to a user account, there
 * is no club field, and the career page is addressed by UUID rather than the
 * slug this screen promises. Persisting any of it means a schema change and a
 * decision about what a "profile" is — the account, or a player row, or both.
 *
 * Ends on the career URL deliberately: the last thing someone sees before
 * finishing setup is the thing they are getting for it.
 */
import { useState } from 'react';
import { ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button, Kicker } from '../../components/ui';

const ROLES = ['Batter', 'Bowler', 'All-rounder', 'Keeper'] as const;
const HANDS = ['Right', 'Left'] as const;

/** A segmented choice. Square, hairline, one filled cell — the system's own. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View>
      <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
        {label}
      </Text>
      <View className="border-border mt-1.5 flex-row border-l border-t">
        {options.map((opt) => {
          const on = opt === value;
          return (
            <Pressable
              key={opt}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(opt)}
              className={`border-border h-10 flex-1 items-center justify-center border-b border-r ${
                on ? 'bg-primary' : 'bg-transparent'
              } active:opacity-70`}
            >
              <Text
                className={`font-heading text-[12px] ${
                  on ? 'text-primary-foreground' : 'text-foreground'
                }`}
                numberOfLines={1}
              >
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View>
      <Text className="font-heading text-[11px] uppercase tracking-[1.6px] text-neutral-700">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98989b"
        accessibilityLabel={label}
        className="text-foreground border-input mt-1.5 h-12 border bg-neutral-100 px-4 font-sans text-base"
      />
    </View>
  );
}

/** "A. Menon" → "a-menon". The shape the career URL will eventually take. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function Profile() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('Batter');
  const [bats, setBats] = useState<(typeof HANDS)[number]>('Right');
  const [bowls, setBowls] = useState('');
  const [club, setClub] = useState('');

  const slug = slugify(name) || 'your-name';

  return (
    <SafeAreaView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-5 pb-6 pt-5 grow">
        <Kicker>Step 3 of 3</Kicker>
        <Text className="text-foreground font-heading mt-2 text-[30px] leading-[34px]">
          Who are you{'\n'}on the field?
        </Text>
        <Text className="text-foreground/70 mt-3 text-[14px] leading-5">
          This builds your public career page. All of it can change later.
        </Text>

        <View className="mt-6 gap-5">
          <Field label="Name" value={name} onChangeText={setName} placeholder="A. Menon" />
          <Segmented label="Role" options={ROLES} value={role} onChange={setRole} />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Segmented label="Bats" options={HANDS} value={bats} onChange={setBats} />
            </View>
            <View className="flex-1">
              <Field
                label="Bowls"
                value={bowls}
                onChangeText={setBowls}
                placeholder="Right-arm off"
              />
            </View>
          </View>

          <Field label="Club" value={club} onChangeText={setClub} placeholder="Koramangala XI" />
        </View>

        {/* The payoff. Someone finishing setup should see what they are
            getting, not just a Done button. */}
        <View className="border-border relative mt-6 border p-4">
          <Text className="font-heading text-[10px] uppercase tracking-[1.6px] text-neutral-600">
            Your page will live at
          </Text>
          <Text className="text-steel-700 font-heading mt-1.5 text-[15px]">
            openinnings.com/p/{slug}
          </Text>
        </View>

        <View className="grow" />

        <View className="mt-8">
          <Button label="Done" onPress={() => router.replace('/matches')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
