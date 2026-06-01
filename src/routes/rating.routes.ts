import { Router } from 'express';
import * as ratingController from '../controllers/rating.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/booking/:bookingId', authenticate, ratingController.getRating);
router.post('/booking/:bookingId', authenticate, ratingController.createRating);
router.get('/service/:serviceId', ratingController.getServiceRatings);

export default router;
