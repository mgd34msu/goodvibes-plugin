export interface AppConfig {
  port: number;
  host: string;
  debug: boolean;
  database: {
    url: string;
    pool: number;
  };
}

export const defaultConfig: AppConfig = {
  port: 9090,
  host: "0.0.0.0",
  debug: false,
  database: {
    url: "postgres://localhost:5432/mydb",
    pool: 20,
  },
};

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  return { ...defaultConfig, ...overrides };
}
