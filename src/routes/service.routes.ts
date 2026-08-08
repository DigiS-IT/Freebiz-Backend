import { Router } from 'express';
import * as serviceController from '../controllers/service.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly } from '../middlewares/role.middleware';
import { getServicesSchema, createServiceSchema, updateServiceSchema } from '../validators/service.validator';

const router = Router();

router.get('/', validateRequest(getServicesSchema), serviceController.getServices);
router.get('/home/categories', validateRequest(getServicesSchema), serviceController.getHomeCategories);
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
  validateRequest(updateServiceSchema),
  serviceController.updateService
);

export default router;
