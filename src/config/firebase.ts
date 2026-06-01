import * as admin from 'firebase-admin';
import serviceAccount from './freebiz-615bd-firebase-adminsdk-fbsvc-bc2bb7de63.json';

export const initializeFirebase = () => {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as any),
      });
      console.log('✅ Firebase Admin SDK initialized using local service account file');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
  }
};

export { admin };
export default admin;

export const sendPushNotification = async (token: string, title: string, body: string, data?: any) => {
  try {
    const message = {
      notification: { title, body },
      data: data || {},
      token: token,
    };

    const response = await admin.messaging().send(message);
    return response;
  } catch (error) {
    console.error('❌ Failed to send push notification:', error);
    throw error;
  }
};
