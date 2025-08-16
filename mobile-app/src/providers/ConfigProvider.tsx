import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AppConfig, setConfig } from '../lib/config';

const ConfigContext = createContext<AppConfig | null>(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setStateConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    const fetchAndCacheConfig = async () => {
      try {
        // Try to get config from cache first
        const cachedConfig = await AsyncStorage.getItem('app_config');
        if (cachedConfig) {
          const parsedConfig = JSON.parse(cachedConfig);
          setStateConfig(parsedConfig);
          setConfig(parsedConfig);
        }

        // Fetch config from Supabase
        const { data, error } = await supabase.from('app_config').select('key, value');

        if (error) {
          throw error;
        }

        if (data) {
          const newConfig = data.reduce((acc: AppConfig, { key, value }) => {
            acc[key] = value;
            return acc;
          }, {});

          // Update state, cache, and global config
          setStateConfig(newConfig);
          setConfig(newConfig);
          await AsyncStorage.setItem('app_config', JSON.stringify(newConfig));
        }
      } catch (error) {
        console.error('Error fetching app configuration:', error);
        // If fetching fails, rely on cached config if available
        if (!config) {
          // Handle case where there is no cached config and fetching fails
          // You might want to show an error message to the user
        }
      }
    };

    fetchAndCacheConfig();
  }, []);

  if (!config) {
    // You can render a loading indicator here while the config is being fetched
    return null; // Or a loading spinner
  }

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
};