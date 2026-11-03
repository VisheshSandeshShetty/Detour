// The list of pages. Each <Route> says: "when the URL looks like this, show this page".

import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Explore from './pages/Explore';
import { LoginPage, RegisterPage } from './pages/Auth';
import JourneyPlanner from './pages/JourneyPlanner';
import JourneyResults from './pages/JourneyResults';
import PlaceDetailsPage from './pages/PlaceDetails';
import Profile from './pages/Profile';
import Saved from './pages/Saved';
import Surprise from './pages/Surprise';

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl font-extrabold text-forest-800">404</p>
      <h1 className="mt-3 text-xl font-bold">This road does not lead anywhere</h1>
      <p className="mt-1 text-sm text-muted">The page you are looking for does not exist.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Explore />} />
        <Route path="/journey" element={<JourneyPlanner />} />
        <Route path="/surprise" element={<Surprise />} />
        <Route path="/journey/:id" element={<JourneyResults />} />
        <Route path="/trip/:id" element={<JourneyResults />} />
        <Route path="/places/:id" element={<PlaceDetailsPage />} />
        <Route
          path="/saved"
          element={
            <ProtectedRoute>
              <Saved />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
