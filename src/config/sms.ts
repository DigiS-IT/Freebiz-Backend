export const sendSms = async (phone: string, message: string): Promise<void> => {
  // Mock SMS sender for development/production
  console.log(`[SMS MOCK] To: ${phone} | Message: ${message}`);
};
