import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { MobileTabBar } from '@/components/NavLinks';
import { getUserId } from '@/lib/auth/local';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getUserId();
  if (!userId) {
    redirect('/login');
  }
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      {/* pb-20 keeps content clear of the mobile tab bar */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <MobileTabBar />
    </div>
  );
}
