export function validateEnvironment(env: Record<string, string | undefined> = process.env) {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET is required. Application refusing to start.');
  }

  if (jwtSecret === 'your-super-secret-key' || jwtSecret === 'secret' || jwtSecret === '123456') {
    throw new Error('JWT_SECRET is set to an insecure default key. Refusing to start.');
  }

  const appEnv = env.APP_ENV || env.NODE_ENV;
  const dbUrl = env.DATABASE_URL || '';

  if (appEnv === 'staging') {
    if (!dbUrl || dbUrl.trim() === '') {
      throw new Error('DATABASE_URL is required in staging environment.');
    }

    // Fail-fast guard against accidentally connecting staging to production DB
    const isProdDb = dbUrl.includes('prod') || dbUrl.includes('production') || (env.PROD_DATABASE_URL && dbUrl === env.PROD_DATABASE_URL);
    if (isProdDb) {
      throw new Error('STAGING ISOLATION VIOLATION: Staging environment detected attempting to connect to Production DATABASE_URL!');
    }
  }

  if (appEnv === 'production') {
    if (!dbUrl || dbUrl.trim() === '') {
      throw new Error('DATABASE_URL is required in production environment.');
    }
  }

  return true;
}
