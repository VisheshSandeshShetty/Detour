// Integration test of accounts, saved places and journeys against a REAL database.
//
// It is skipped unless DATABASE_URL points at a database that has the Detour tables
// (run `npx prisma migrate deploy` first). Use a throw-away database, not your real one:
//
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/detour_test" npm test

process.env.JWT_SECRET ??= 'test-secret-test-secret';

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

const hasDatabase = Boolean(process.env.DATABASE_URL);

// A tiny HTTP client that remembers the login cookie, like a browser does
class TestClient {
  cookie = '';
  constructor(private base: string) {}

  async call(method: string, path: string, body?: unknown) {
    const response = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const json = (await response.json().catch(() => null)) as any;
    return { status: response.status, json };
  }
}

const place = {
  id: 'node-111',
  name: 'Test Fort',
  category: 'historic',
  latitude: 13.5,
  longitude: 74.5,
  description: null,
  rating: null,
  imageUrl: null,
};

describe('accounts, saved places and journeys', { skip: !hasDatabase && 'DATABASE_URL is not set' }, () => {
  let server: Server;
  let base = '';
  const stamp = Date.now();
  const emails = [`alice-${stamp}@example.com`, `bob-${stamp}@example.com`];

  before(async () => {
    const { createApp } = await import('../app');
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    const { prisma } = await import('../lib/prisma');
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.place.deleteMany({ where: { providerId: place.id } });
    await prisma.$disconnect();
    server?.close();
  });

  test('registration, login and logout', async () => {
    const alice = new TestClient(base);

    let result = await alice.call('POST', '/api/auth/register', { name: 'Alice', email: emails[0], password: 'short' });
    assert.equal(result.status, 400); // password too short

    result = await alice.call('POST', '/api/auth/register', { name: 'Alice', email: emails[0], password: 'password123' });
    assert.equal(result.status, 201);
    assert.equal(result.json.data.user.email, emails[0]);
    assert.equal(result.json.data.user.passwordHash, undefined, 'the hash must never be sent to the browser');

    result = await new TestClient(base).call('POST', '/api/auth/register', { name: 'Alice', email: emails[0], password: 'password123' });
    assert.equal(result.status, 409); // email already used

    result = await alice.call('GET', '/api/auth/me');
    assert.equal(result.status, 200);

    result = await new TestClient(base).call('POST', '/api/auth/login', { email: emails[0], password: 'wrong-password' });
    assert.equal(result.status, 401);

    result = await alice.call('POST', '/api/auth/logout');
    assert.equal(result.status, 200);
    result = await alice.call('GET', '/api/auth/me');
    assert.equal(result.status, 401);

    result = await alice.call('POST', '/api/auth/login', { email: emails[0], password: 'password123' });
    assert.equal(result.status, 200);
  });

  test('saved places belong to one user only', async () => {
    const alice = new TestClient(base);
    await alice.call('POST', '/api/auth/login', { email: emails[0], password: 'password123' });
    const bob = new TestClient(base);
    await bob.call('POST', '/api/auth/register', { name: 'Bob', email: emails[1], password: 'password123' });

    assert.equal((await new TestClient(base).call('GET', '/api/saved-places')).status, 401); // guests are refused

    let result = await alice.call('POST', '/api/saved-places', place);
    assert.equal(result.status, 201);
    const savedId = result.json.data.saved.savedId;

    result = await alice.call('POST', '/api/saved-places', place); // saving twice is harmless
    assert.equal(result.status, 201);
    assert.equal(result.json.data.saved.savedId, savedId);

    result = await alice.call('GET', '/api/saved-places');
    assert.equal(result.json.data.saved.length, 1);
    assert.equal(result.json.data.saved[0].place.id, 'node-111');

    result = await bob.call('GET', '/api/saved-places');
    assert.equal(result.json.data.saved.length, 0, "Bob must not see Alice's places");
    result = await bob.call('DELETE', `/api/saved-places/${savedId}`);
    assert.equal(result.status, 404, "Bob must not be able to delete Alice's saved place");

    result = await alice.call('DELETE', `/api/saved-places/${savedId}`);
    assert.equal(result.status, 200);
    result = await alice.call('GET', '/api/saved-places');
    assert.equal(result.json.data.saved.length, 0);
  });

  test('journeys are saved with their stops and are private', async () => {
    const alice = new TestClient(base);
    await alice.call('POST', '/api/auth/login', { email: emails[0], password: 'password123' });
    const bob = new TestClient(base);
    await bob.call('POST', '/api/auth/login', { email: emails[1], password: 'password123' });

    const journey = {
      origin: { name: 'Manipal', latitude: 13.35, longitude: 74.79 },
      destination: { name: 'Goa', latitude: 15.49, longitude: 73.83 },
      radiusKm: 10,
      totalDistanceKm: 280.5,
      durationMin: 330,
      stops: [place],
    };

    let result = await alice.call('POST', '/api/journeys', { ...journey, radiusKm: 7 });
    assert.equal(result.status, 400); // only 5, 10, 20, 30 are allowed

    result = await alice.call('POST', '/api/journeys', journey);
    assert.equal(result.status, 201);
    const journeyId = result.json.data.journey.id;
    assert.equal(result.json.data.journey.stops.length, 1);

    result = await alice.call('GET', '/api/journeys');
    assert.equal(result.json.data.journeys.length, 1);
    assert.equal(result.json.data.journeys[0].stopCount, 1);

    assert.equal((await alice.call('GET', `/api/journeys/${journeyId}`)).status, 200);
    assert.equal((await bob.call('GET', `/api/journeys/${journeyId}`)).status, 404, "Bob must not read Alice's journey");
    assert.equal((await bob.call('GET', `/api/journeys/${journeyId}/attractions`)).status, 404);
    assert.equal((await bob.call('DELETE', `/api/journeys/${journeyId}`)).status, 404);

    assert.equal((await alice.call('DELETE', `/api/journeys/${journeyId}`)).status, 200);
    assert.equal((await alice.call('GET', `/api/journeys/${journeyId}`)).status, 404);
  });

  test('input is validated', async () => {
    const guest = new TestClient(base);
    assert.equal((await guest.call('GET', '/api/places/nearby?lat=abc&lon=1')).status, 400);
    assert.equal((await guest.call('GET', '/api/places/not-a-place')).status, 400);
    assert.equal((await guest.call('POST', '/api/journeys/plan', { origin: {}, destination: {}, radiusKm: 10 })).status, 400);
    assert.equal((await guest.call('GET', '/api/does-not-exist')).status, 404);
  });
});
