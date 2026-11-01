// Starts the server.  Run with: npm run dev

import { config } from './config';
import { prisma } from './lib/prisma';
import { createApp } from './app';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Detour server running on http://localhost:${config.port}`);
  console.log(`Overpass servers: ${config.overpassUrls.join(', ')}`);
  console.log(`User-Agent: ${config.userAgent}`);
});

// Close the database connection cleanly when the server is stopped (Ctrl+C)
async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
