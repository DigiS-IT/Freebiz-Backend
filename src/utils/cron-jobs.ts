import { prisma } from '../app';

/**
 * Cron job to mark bookings as EXPIRED when the booking date passes
 * without the QR code being scanned
 */
export const setupExpiredBookingsJob = () => {
  // Run every hour
  const INTERVAL = 60 * 60 * 1000;
  
  const markExpiredBookings = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await prisma.booking.updateMany({
        where: {
          status: 'BOOKED',
          bookingDate: { lt: today },
        },
        data: {
          status: 'EXPIRED',
          expiredAt: new Date(),
        },
      });

      if (result.count > 0) {
        console.log(`🔄 Marked ${result.count} bookings as expired`);
      }
    } catch (error) {
      console.error('❌ Failed to process expired bookings:', error);
    }
  };

  // Initial run
  markExpiredBookings();
  
  // Schedule subsequent runs
  setInterval(markExpiredBookings, INTERVAL);
};

/**
 * Cron job to update subscription statuses
 */
export const setupSubscriptionJob = () => {
  const INTERVAL = 24 * 60 * 60 * 1000; // Daily
  
  const updateSubscriptions = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Expire subscriptions that have ended
      await prisma.subscription.updateMany({
        where: {
          status: 'ACTIVE',
          endDate: { lt: today },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      console.log('🔄 Subscription statuses updated');
    } catch (error) {
      console.error('❌ Failed to update subscriptions:', error);
    }
  };

  // Run daily at midnight
  updateSubscriptions();
  setInterval(updateSubscriptions, INTERVAL);
};
