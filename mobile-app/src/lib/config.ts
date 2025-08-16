export interface AppConfig {
  [key: string]: string;
}

let config: AppConfig | null = null;

export const setConfig = (newConfig: AppConfig) => {
  config = newConfig;
};

export const getConfig = () => {
  if (!config) {
    throw new Error('Config not initialized');
  }
  return config;
};