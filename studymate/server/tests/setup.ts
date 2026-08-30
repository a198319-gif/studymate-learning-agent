process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'mysql://studymate:studymate_local@localhost:3306/studymate_test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-only-jwt-secret-with-at-least-32-characters';
process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
