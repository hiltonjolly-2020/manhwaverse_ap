import * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Menu, LogOut, User, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { auth, signInWithGoogle } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export function Navbar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [user] = useAuthState(auth);
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <nav className="w-full bg-[#0A0B0D] px-8 py-6 flex items-center justify-between gap-8 shrink-0">
      <div className="flex items-center gap-6 flex-1">
        <Link to="/" className="text-[#E2E8F0] font-black text-xl tracking-tighter hover:text-[#4FD1C5] transition-colors">
          Manhwa<span className="text-[#4FD1C5]">Verse</span>
        </Link>
        <form onSubmit={handleSearch} className="flex-1 max-w-[400px] relative hidden md:block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input 
            placeholder="Search manhwa, authors, or tags..." 
            className="pl-11 h-11 bg-[#1A1D23] border-[#2D333B] text-[#E2E8F0] text-sm rounded-lg focus:ring-[#4FD1C5] focus:border-[#4FD1C5]/50 placeholder:text-[#94A3B8]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <Link to="/library">
              <Button variant="outline" className="rounded-full bg-[#1A1D23] border-[#2D333B] text-[#E2E8F0] hover:bg-[#23272F] hover:border-[#4FD1C5]/50 gap-2 px-3 md:px-4">
                <Bookmark className="w-4 h-4 md:hidden" />
                <span className="hidden md:inline">My Library</span>
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-3 bg-[#1A1D23] border border-[#2D333B] px-4 py-1.5 rounded-full hover:bg-[#23272F] hover:border-[#4FD1C5]/50 transition-colors outline-none cursor-pointer">
                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-6 h-6 rounded-full object-cover border border-[#4FD1C5]" />
                <span className="text-sm font-medium text-[#E2E8F0]">{user.displayName?.split(' ')[0]}</span>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#121418] border-[#2D333B] text-[#E2E8F0]">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.displayName}</p>
                  <p className="text-xs leading-none text-[#94A3B8]">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#2D333B]" />
              <DropdownMenuItem onClick={() => auth.signOut()} className="text-red-400 focus:text-red-400 cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        ) : (
          <Button 
            variant="outline" 
            className="rounded-full bg-[#1A1D23] border-[#2D333B] text-[#E2E8F0] hover:bg-[#23272F] gap-2"
            onClick={signInWithGoogle}
          >
            <User className="w-4 h-4" />
            Sign In
          </Button>
        )}
        
        <Button variant="ghost" size="icon" className="lg:hidden text-[#94A3B8]">
          <Menu className="w-6 h-6" />
        </Button>
      </div>
    </nav>
  );
}
