import { Router } from 'express';
import * as qrController from '../controllers/qr.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly } from '../middlewares/role.middleware';

const router = Router();

router.post('/validate', authenticate, spOnly, qrController.scanQRCode);
router.post('/use', authenticate, spOnly, qrController.acceptQRCode);

export default router;
