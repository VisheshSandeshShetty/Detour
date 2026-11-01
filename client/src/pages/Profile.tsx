// "/profile"  Account details and journey history (login required).

import { Bookmark, Clock, LogOut, MapPin, Route, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorBanner, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatDuration, formatKm } from '../lib/format';
import type { JourneySummary } from '../types';

export default function Profile() {
  const { user, logout } = useAuth();
  const { items } = useSavedPlaces();
  const navigate = useNavigate();

  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listJourneys()
      .then(setJourneys)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(journey: JourneySummary) {
    if (!window.confirm(`Delete the journey ${journey.originName} to ${journey.destinationName}?`)) return;
    try {
      await api.deleteJourney(journey.id);
      setJourneys((current) => current.filter((item) => item.id !== journey.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  if (!user) return null; // ProtectedRoute makes sure this does not happen

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-800 text-2xl font-extrabold text-white">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-xl font-extrabold">{user.name}</h1>
            <p className="text-sm text-muted">{user.email}</p>
            <p className="mt-0.5 text-xs text-muted">Member since {formatDate(user.createdAt)}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-secondary">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Link to="/saved" className="card flex items-center gap-3 p-5 transition hover:border-forest-300">
          <Bookmark className="h-5 w-5 text-forest-700" />
          <div>
            <p className="text-2xl font-extrabold leading-none">{items.length}</p>
            <p className="mt-1 text-xs text-muted">Saved places</p>
          </div>
        </Link>
        <div className="card flex items-center gap-3 p-5">
          <Route className="h-5 w-5 text-forest-700" />
          <div>
            <p className="text-2xl font-extrabold leading-none">{loading ? '–' : journeys.length}</p>
            <p className="mt-1 text-xs text-muted">Saved journeys</p>
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-extrabold">Journey history</h2>
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

      {loading ? (
        <Spinner label="Loading your journeys..." className="justify-start" />
      ) : journeys.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Route}
            title="No journeys yet"
            text="Plan a journey and press Save to keep it here."
            action={<Link to="/journey" className="btn-primary">Plan a journey</Link>}
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {journeys.map((journey) => (
            <li key={journey.id} className="card flex items-center justify-between gap-3 p-4">
              <Link to={`/journey/${journey.id}`} className="min-w-0 flex-1">
                <p className="truncate font-bold hover:text-forest-800">
                  {journey.originName} <span className="text-forest-600">→</span> {journey.destinationName}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{formatKm(journey.totalDistance)}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(journey.estimatedDuration)}</span>
                  <span>{journey.corridorRadius} km corridor</span>
                  <span>{journey.stopCount} {journey.stopCount === 1 ? 'stop' : 'stops'}</span>
                  <span>{formatDate(journey.createdAt)}</span>
                </p>
              </Link>
              <button onClick={() => handleDelete(journey)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700" aria-label="Delete journey">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
