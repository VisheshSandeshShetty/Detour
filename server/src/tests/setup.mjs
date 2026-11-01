// Runs before every test file (see the "test" script in package.json).
// config.ts refuses to load without a JWT_SECRET, and ES imports run before any code in a
// test file, so the value has to be set here instead.
process.env.JWT_SECRET ??= 'test-secret-test-secret';
