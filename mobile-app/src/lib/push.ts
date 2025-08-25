// mobile-app/src/lib/push.ts

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Registers the device for push notifications and saves the token to Supabase.
 * This function should be called once a user is authenticated.
 * @param userId The ID of the authenticated user.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<void> {
  if (!Device.isDevice) {
    console.log('Push notifications are only available on physical devices.');
    return;
  }

  // 1. Check for existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // 2. If permissions are not granted, ask the user
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // 3. If permissions are still not granted, exit
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return;
  }

  // 4. Get the Expo push token
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo Push Token:', token);

    // 5. Save the token to your database, associated with the user
    if (token) {
      const { error } = await supabase
        .from('user_push_tokens')
        .upsert({ user_id: userId, expo_token: token }, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving push token to Supabase:', error);
      } else {
        console.log('Successfully saved push token.');
      }
    }
  } catch (e) {
    console.error("Error getting Expo push token:", e);
  }

  // Recommended for Android: specify a notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
}