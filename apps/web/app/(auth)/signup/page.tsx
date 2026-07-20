import Link from 'next/link';
import { signupAction } from './actions';
import { AuthShell } from '../auth-shell';
import { Button, FormError, Input, Label } from '@/components/ui';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. No credit card. No premium tier."
    >
      <FormError message={error} />
      <form action={signupAction} className="space-y-4">
        <div>
          <Label htmlFor="displayName">Display name (optional)</Label>
          <Input id="displayName" name="displayName" type="text" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button type="submit" className="w-full" size="lg">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
