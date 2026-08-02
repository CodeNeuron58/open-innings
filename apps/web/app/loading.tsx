import { LogoMark } from '@/components/ui';

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <LogoMark className="h-10 w-10 animate-spin [animation-duration:1.6s]" />
      <p className="text-muted-foreground text-sm">Taking the field…</p>
    </div>
  );
}
