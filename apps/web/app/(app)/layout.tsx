import { Nav } from '@/components/Nav';
import { MobileTabBar } from '@/components/NavLinks';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      {/* pb-20 keeps content clear of the mobile tab bar */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <MobileTabBar />
    </div>
  );
}
