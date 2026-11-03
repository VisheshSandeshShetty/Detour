import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ActiveTripProvider } from './context/ActiveTripContext';
import { AuthProvider } from './context/AuthContext';
import { SavedPlacesProvider } from './context/SavedPlacesContext';
import './index.css';

// The order matters: SavedPlacesProvider needs to know who is logged in (AuthProvider)
// and needs the router (BrowserRouter) to redirect guests to the login page.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SavedPlacesProvider>
          <ActiveTripProvider>
            <App />
          </ActiveTripProvider>
        </SavedPlacesProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
