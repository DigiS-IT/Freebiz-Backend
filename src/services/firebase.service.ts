import { getFirebaseMessaging, initializeFirebase } from '../config/firebase';

class FirebaseService {
  private messaging: any = null;

  constructor() {
    try {
      initializeFirebase();
      this.messaging = getFirebaseMessaging();
      console.log('✅ Firebase Admin SDK messaging initialized');
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

export const firebaseService = new FirebaseService();
