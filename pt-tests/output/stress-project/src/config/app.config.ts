/**
 * Application configuration
 */

export interface AppConfig {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
    port: number;
    host: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    ssl: boolean;
    poolSize: number;
  };
  auth: {
    jwtSecret: string;
    jwtExpiration: number;
    refreshTokenExpiration: number;
    bcryptRounds: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    destination: 'console' | 'file' | 'both';
  };
  features: {
    enableRegistration: boolean;
    enableEmailVerification: boolean;
    enableTwoFactor: boolean;
    maxLoginAttempts: number;
  };
}

/**
 * Load configuration from environment variables
 */
function loadConfig(): AppConfig {
  return {
    app: {
      name: process.env.APP_NAME || 'stress-project',
      version: process.env.APP_VERSION || '1.0.0',
      environment: (process.env.NODE_ENV as AppConfig['app']['environment']) || 'development',
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
    },
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      name: process.env.DB_NAME || 'stress_db',
      ssl: process.env.DB_SSL === 'true',
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
      jwtExpiration: parseInt(process.env.JWT_EXPIRATION || '3600', 10), // 1 hour
      refreshTokenExpiration: parseInt(process.env.REFRESH_TOKEN_EXPIRATION || '604800', 10), // 7 days
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    logging: {
      level: (process.env.LOG_LEVEL as AppConfig['logging']['level']) || 'info',
      format: (process.env.LOG_FORMAT as AppConfig['logging']['format']) || 'json',
      destination: (process.env.LOG_DESTINATION as AppConfig['logging']['destination']) || 'console',
    },
    features: {
      enableRegistration: process.env.ENABLE_REGISTRATION !== 'false',
      enableEmailVerification: process.env.ENABLE_EMAIL_VERIFICATION === 'true',
      enableTwoFactor: process.env.ENABLE_TWO_FACTOR === 'true',
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    },
  };
}

/**
 * Validate configuration
 */
function validateConfig(config: AppConfig): void {
  if (!config.app.name) {
    throw new Error('App name is required');
  }

  if (config.app.port < 1 || config.app.port > 65535) {
    throw new Error('Invalid port number');
  }

  if (config.app.environment === 'production' && config.auth.jwtSecret === 'default-secret-change-in-production') {
    throw new Error('Must change JWT secret in production');
  }

  if (config.database.poolSize < 1 || config.database.poolSize > 100) {
    throw new Error('Database pool size must be between 1 and 100');
  }
}

export const appConfig = loadConfig();
validateConfig(appConfig);
