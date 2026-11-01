// The frame around every page: navigation bar on top, footer at the bottom.
// The journey results page uses the whole screen for its map, so it has no footer.

import { Outlet, useLocation } from 'react-router-dom';
import Navbar, { DetourLogo } from './Navbar';

export default function Layout() {
  const { pathname } = useLocation();
  const fullScreen = pathname.startsWith('/journey/');

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Outlet />
      </main>
      {!fullScreen && (
        <footer className="mt-16 border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
            <DetourLogo />
            <p>
              Map data &copy;{' '}
              <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap contributors
              </a>
              . Routing by OSRM. Search by Photon.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
