/**
 * Main entry point for the stress project
 * 
 * This module exports all public APIs from the application.
 */

export { User, type UserRole, type UserStatus } from './models/user.js';
export { Product, type ProductCategory, type ProductInterface } from './models/product.js';
export { AuthService, type AuthCredentials, type AuthToken } from './services/auth.js';
export { DatabaseService, type DatabaseConfig, type QueryResult } from './services/database.js';
export { formatDate, parseDate, deepClone, debounce, throttle } from './utils/helpers.js';
export { validateEmail, validatePassword, validateUrl, validateUsername } from './utils/validators.js';
export { appConfig, type AppConfig } from './config/app.config.js';

/**
 * Application version
 */
export const VERSION = '1.0.0';

/**
 * Initialize the application
 */
export async function initialize(): Promise<void> {
  console.log(`Initializing stress-project v${VERSION}`);
  // Initialization logic here
}

/**
 * Shutdown the application gracefully
 */
export async function shutdown(): Promise<void> {
  console.log('Shutting down stress-project');
  // Cleanup logic here
}
