import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadToS3 } from '../services/upload.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let folder = req.body.folder || 'general';
    const assetType = req.body.assetType;
    const userId = req.user!.id;
    const spId = req.body.spId || req.user!.serviceProviderId || 'general';

    if (assetType === 'user-profile') {
      folder = `user-profiles/${userId}`;
    } else if (assetType === 'free-services') {
      folder = `service-providers/${spId}/free-services`;
    } else if (assetType === 'discount-services') {
      folder = `service-providers/${spId}/discount-services`;
    }

    const fileUrl = await uploadToS3(req.file, folder);

    res.status(200).json({
      success: true,
      data: { url: fileUrl },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
