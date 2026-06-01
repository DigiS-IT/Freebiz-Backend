import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { customerOnly } from '../middlewares/role.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { updateProfileSchema } from '../validators/customer.validator';

const router = Router();

router.get('/profile', authenticate, customerOnly, customerController.getProfile);
router.patch('/profile', authenticate, customerOnly, validateRequest(updateProfileSchema), customerController.updateProfile);

export default router;
