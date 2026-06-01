import admin from '../config/firebase';

export const sendPushNotification = async (
  token: string,
  title: string,
  body: string,
  data?: any
): Promise<void> => {
  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: data || {},
      token,
    };

    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

export const sendToTopic = async (
  topic: string,
  title: string,
  body: string,
  data?: any
): Promise<void> => {
  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: data || {},
      topic,
    };

    const response = await admin.messaging().send(message);
    console.log('Successfully sent message to topic:', response);
  } catch (error) {
    console.error('Error sending topic notification:', error);
  }
};
