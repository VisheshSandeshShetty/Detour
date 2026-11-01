// The top navigation bar. On phones the links fold into a menu.

import { Bookmark, Compass, LogIn, Menu, Route, Sparkles, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// The Detour logo: the word DETOUR inside an arrow that points to the left.
// It is an SVG, so it stays sharp at any size. `className` sets the height, e.g. "h-8".
export function DetourLogo({ className = 'h-8' }: { className?: string }) {
  return (
    <Link to="/" aria-label="Detour home" className="inline-flex shrink-0 items-center">
      <svg viewBox="0 0 136 36" className={`${className} w-auto`} role="img" aria-label="Detour">
        {/* Arrow body: the tip is on the left. The rounded stroke softens the corners. */}
        <polygon
          points="3,18 16,3 133,3 133,33 16,33"
          fill="#1f4a3a"
          stroke="#1f4a3a"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <text
          x="78"
          y="23.5"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="15"
          fontWeight="800"
          letterSpacing="1.8"
          style={{ fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif' }}
        >
          DETOUR
        </text>
      </svg>
    </Link>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-forest-50 text-forest-800' : 'text-muted hover:bg-forest-50 hover:text-forest-800'
  }`;

export default function Navbar() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the phone menu whenever the page changes
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const links = (
    <>
      <NavLink to="/" end className={linkClass}>
        <Compass className="h-4 w-4" /> Around me
      </NavLink>
      <NavLink to="/journey" className={linkClass}>
        <Route className="h-4 w-4" /> Plan a route
      </NavLink>
      <NavLink to="/surprise" className={linkClass}>
        <Sparkles className="h-4 w-4" /> Surprise me
      </NavLink>
      <NavLink to="/saved" className={linkClass}>
        <Bookmark className="h-4 w-4" /> Saved
      </NavLink>
    </>
  );

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <DetourLogo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <NavLink to="/profile" className={linkClass} aria-label="Your profile">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-800 text-xs font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
            </NavLink>
          ) : (
            <>
              <Link to="/login" className="btn-ghost btn-sm hidden sm:inline-flex">
                <LogIn className="h-4 w-4" /> Log in
              </Link>
              <Link to="/register" className="btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
          <button
            className="btn-ghost btn-sm md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="absolute inset-x-0 top-16 flex flex-col gap-1 border-b border-line bg-paper px-4 pb-4 pt-2 shadow-lift md:hidden" aria-label="Mobile">
          {links}
          {user ? (
            <NavLink to="/profile" className={linkClass}>
              <User className="h-4 w-4" /> Profile
            </NavLink>
          ) : (
            <NavLink to="/login" className={linkClass}>
              <LogIn className="h-4 w-4" /> Log in
            </NavLink>
          )}
        </nav>
      )}
    </header>
  );
}
