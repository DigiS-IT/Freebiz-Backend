import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import serviceAccount from './freebiz-615bd-firebase-adminsdk-fbsvc-bc2bb7de63.json';

export const initializeFirebase = () => {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const app = initializeApp({
    credential: cert(serviceAccount as any),
  });
  console.log('✅ Firebase Admin SDK initialized using local service account file');
  return app;
};

export const getFirebaseAuth = () => getAuth(initializeFirebase());
export const getFirebaseMessaging = () => getMessaging(initializeFirebase());

export const sendPushNotification = async (token: string, title: string, body: string, data?: any) => {
  try {
    const message = {
      notification: { title, body },
      data: data || {},
      token: token,
    };

    const response = await getFirebaseMessaging().send(message);
    return response;
  } catch (error) {
    console.error('❌ Failed to send push notification:', error);
    throw error;
  }
};
