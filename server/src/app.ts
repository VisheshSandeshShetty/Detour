// Builds the Express app (without starting it, so tests can reuse it).

import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import geocodeRoutes from './routes/geocode';
import journeyRoutes from './routes/journeys';
import placeRoutes from './routes/places';
import savedPlaceRoutes from './routes/savedPlaces';
import surpriseRoutes from './routes/surprise';

export function createApp() {
  const app = express();

  // Security headers. The content-security-policy is relaxed just enough for map tiles,
  // place photos (any https image) and Google Fonts.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'https:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'upgrade-insecure-requests': null,
        },
      },
    })
  );
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/geocode', geocodeRoutes);
  app.use('/api/places', placeRoutes);
  app.use('/api/journeys', journeyRoutes);
  app.use('/api/saved-places', savedPlaceRoutes);
  app.use('/api/surprise', surpriseRoutes);
  app.use('/api', notFoundHandler);

  // In production the server can also serve the built React app (client/dist), so one
  // server runs the whole project.
  const clientBuild = path.resolve(__dirname, '../../client/dist');
  if (config.nodeEnv === 'production' && fs.existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    // Any other URL gets index.html, and React Router decides which page to show
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
