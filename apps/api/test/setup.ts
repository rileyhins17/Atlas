// Test environment bootstrap. Nest decorators need the reflect-metadata
// polyfill, and loadEnv() validates the full schema, so every required
// variable gets a dummy test value here (no real secrets, no database).
import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/atlas_test';
process.env.SESSION_SECRET = 'test-session-secret-0123456789';
process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
