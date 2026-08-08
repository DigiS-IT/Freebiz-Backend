import { Router } from 'express';
import * as qrController from '../controllers/qr.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly } from '../middlewares/role.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { scanQRSchema, acceptQRSchema, rejectQRSchema } from '../validators/booking.validator';

const router = Router();

router.post('/validate', authenticate, spOnly, validateRequest(scanQRSchema), qrController.scanQRCode);
router.post('/use', authenticate, spOnly, validateRequest(acceptQRSchema), qrController.acceptQRCode);
router.post('/reject', authenticate, spOnly, validateRequest(rejectQRSchema), qrController.rejectQRCode);

export default router;
