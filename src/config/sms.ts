export const sendSms = async (phone: string, message: string): Promise<void> => {
  // Mock SMS sender for development
  console.log(`[SMS MOCK] To: ${phone} | Message: ${message}`);
  
  if (process.env.NODE_ENV === 'production') {
    // Implement Twilio or other SMS provider here
    try {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    } catch (error) {
      console.error('❌ Failed to send real SMS:', error);
      // Don't throw in dev, but might want to in prod
    }
  }
};
