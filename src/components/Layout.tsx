import * as React from 'react';
import { Navbar } from './Navbar';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Home, Compass, TrendingUp, Search, Bookmark, History, Download, LogOut } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

export function Layout() {
  const location = useLocation();
  const [user] = useAuthState(auth);
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[240px] bg-[#121418] border-r border-[#2D333B] flex flex-col p-6 shrink-0 hidden lg:flex">
        <Link to="/" className="flex items-center gap-2 mb-10">
          <span className="text-2xl font-black tracking-tighter text-[#E2E8F0]">
            Manhwa<span className="text-[#4FD1C5]">Verse</span>
          </span>
        </Link>

        <div className="space-y-8">
          <div className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-bold">Main Menu</h3>
            <nav className="space-y-1">
              <SidebarLink to="/" icon={<Home className="w-4 h-4" />} label="Home" active={isActive('/')} />
              <SidebarLink to="/search" icon={<Search className="w-4 h-4" />} label="Advanced Search" active={isActive('/search')} />
            </nav>
          </div>

          <div className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-bold">Your Library</h3>
            <nav className="space-y-1">
              <SidebarLink to="/library" icon={<Bookmark className="w-4 h-4" />} label="Bookmarks" active={isActive('/library')} />
              <SidebarLink to="/history" icon={<History className="w-4 h-4" />} label="History" active={isActive('/history')} />
            </nav>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-[#2D333B]">
          {user ? (
            <button 
              onClick={() => auth.signOut()}
              className="flex items-center gap-3 text-sm text-[#EF4444] hover:opacity-80 transition-opacity w-full text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <Link to="/login" className="flex items-center gap-3 text-sm text-[#94A3B8] hover:text-white transition-colors">
              <LogOut className="w-4 h-4 rotate-180" />
              Sign In
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
          
          <footer className="border-t border-[#2D333B] py-12 mt-20">
            <div className="flex flex-col md:flex-row justify-between gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="font-black tracking-tighter text-xl text-[#E2E8F0]">
                    Manhwa<span className="text-[#4FD1C5]">Verse</span>
                  </span>
                </div>
                <p className="text-sm text-[#94A3B8] max-w-xs">
                  The ultimate destination for manhwa readers. Immersive, fast, and free.
                </p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#E2E8F0]">Browse</h4>
                  <ul className="text-sm text-[#94A3B8] space-y-2">
                    <li><Link to="/" className="hover:text-[#4FD1C5] transition-colors">Trending</Link></li>
                    <li><Link to="/search" className="hover:text-[#4FD1C5] transition-colors">Search</Link></li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#E2E8F0]">Account</h4>
                  <ul className="text-sm text-[#94A3B8] space-y-2">
                    <li><Link to="/library" className="hover:text-[#4FD1C5] transition-colors">Library</Link></li>
                    <li><Link to="/history" className="hover:text-[#4FD1C5] transition-colors">History</Link></li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-[#2D333B] text-xs text-[#94A3B8] flex justify-between">
              <p>© 2024 ManhwaVerse. All rights reserved.</p>
              <div className="flex gap-4">
                <Link to="/debug-mangahere" className="hover:text-[#4FD1C5]">Technical Proof</Link>
                <span className="hover:text-[#4FD1C5] cursor-pointer">Privacy Policy</span>
                <span className="hover:text-[#4FD1C5] cursor-pointer">Terms of Service</span>
              </div>
            </div>
          </footer>
        </main>
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

function SidebarLink({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 py-2.5 text-sm transition-colors ${
        active ? 'text-[#4FD1C5] font-bold' : 'text-[#94A3B8] hover:text-[#E2E8F0]'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
