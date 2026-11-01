// Wrap a page in <ProtectedRoute> to make it available to logged-in users only.
// Guests are sent to /login and returned here afterwards.

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your login..." className="py-24" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname, message: 'Please log in to see this page.' }} />;
  }
  return <>{children}</>;
}
