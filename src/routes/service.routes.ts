import { Router } from 'express';
import * as serviceController from '../controllers/service.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly } from '../middlewares/role.middleware';
import { getServicesSchema, createServiceSchema } from '../validators/service.validator';

const router = Router();

router.get('/', validateRequest(getServicesSchema), serviceController.getServices);
router.get('/:id', serviceController.getServiceById);

router.post(
  '/',
  authenticate,
  spOnly,
  validateRequest(createServiceSchema),
  serviceController.createService
);

router.put(
  '/:id',
  authenticate,
  spOnly,
  validateRequest(createServiceSchema),
  serviceController.updateService
);

export default router;
