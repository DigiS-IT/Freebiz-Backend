import { Router } from 'express';
import * as bookingController from '../controllers/booking.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { customerOnly } from '../middlewares/role.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { createBookingSchema, cancelBookingSchema } from '../validators/booking.validator';

const router = Router();

router.post('/', authenticate, customerOnly, validateRequest(createBookingSchema), bookingController.createBooking);
router.get('/my', authenticate, customerOnly, bookingController.getMyBookings);
router.get('/:id', authenticate, customerOnly, bookingController.getBookingDetail);
router.post('/:id/cancel', authenticate, customerOnly, validateRequest(cancelBookingSchema), bookingController.cancelBooking);

export default router;
