import * as admin from 'firebase-admin';
import serviceAccount from '../config/freebiz-615bd-firebase-adminsdk-fbsvc-bc2bb7de63.json';

class FirebaseService {
  private messaging: admin.messaging.Messaging | null = null;

  constructor() {
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as any),
        });
      }
      this.messaging = admin.messaging();
      console.log('✅ Firebase Admin SDK initialized in FirebaseService using local file');
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    }
  }

  async sendNotification(token: string, title: string, body: string, data: any = {}) {
    if (!this.messaging) return;

    try {
      const message = {
        notification: { title, body },
        token: token,
        data: data,
      };

      await this.messaging.send(message);
    } catch (error) {
      console.error('Firebase Notification Error:', error);
    }
  }

  async sendToTopic(topic: string, title: string, body: string, data: any = {}) {
    if (!this.messaging) return;

    try {
      const message = {
        notification: { title, body },
        topic: topic,
        data: data,
      };

      await this.messaging.send(message);
    } catch (error) {
      console.error('Firebase Topic Notification Error:', error);
    }
  }
}

export default new FirebaseService();
