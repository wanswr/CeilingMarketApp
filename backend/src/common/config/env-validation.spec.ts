import { validateEnvironment } from './env-validation';

describe('Environment Startup Validation', () => {
  it('A: APP_ENV=staging + staging DB -> valid configuration', () => {
    const mockEnv = {
      APP_ENV: 'staging',
      JWT_SECRET: 'super-secure-staging-jwt-secret-key-12345',
      DATABASE_URL: 'postgresql://staging_user:password@staging-db.internal:5432/ceilingsapp_staging',
    };

    expect(validateEnvironment(mockEnv)).toBe(true);
  });

  it('B: APP_ENV=staging + production DATABASE_URL -> refuses to start', () => {
    const mockEnv = {
      APP_ENV: 'staging',
      JWT_SECRET: 'super-secure-staging-jwt-secret-key-12345',
      DATABASE_URL: 'postgresql://prod_user:password@prod-db.internal:5432/ceilingsapp_production',
    };

    expect(() => validateEnvironment(mockEnv)).toThrow(
      'STAGING ISOLATION VIOLATION: Staging environment detected attempting to connect to Production DATABASE_URL!'
    );
  });

  it('C: Staging without JWT_SECRET -> startup fails', () => {
    const mockEnv = {
      APP_ENV: 'staging',
      DATABASE_URL: 'postgresql://staging_user:password@staging-db.internal:5432/ceilingsapp_staging',
    };

    expect(() => validateEnvironment(mockEnv)).toThrow('JWT_SECRET is required. Application refusing to start.');
  });

  it('D: Production without JWT_SECRET -> startup fails', () => {
    const mockEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:password@prod-db.internal:5432/ceilingsapp_prod',
    };

    expect(() => validateEnvironment(mockEnv)).toThrow('JWT_SECRET is required. Application refusing to start.');
  });

  it('E: Weak/default JWT_SECRET ("your-super-secret-key") -> startup fails', () => {
    const mockEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'your-super-secret-key',
      DATABASE_URL: 'postgresql://prod_user:password@prod-db.internal:5432/ceilingsapp_prod',
    };

    expect(() => validateEnvironment(mockEnv)).toThrow(
      'JWT_SECRET is set to an insecure default key. Refusing to start.'
    );
  });

  it('F: Valid production configuration -> passes validation', () => {
    const mockEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'super-secure-production-jwt-secret-key-99999',
      DATABASE_URL: 'postgresql://prod_user:password@prod-db.internal:5432/ceilingsapp_prod',
    };

    expect(validateEnvironment(mockEnv)).toBe(true);
  });
});
