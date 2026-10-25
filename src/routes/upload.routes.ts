import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadToS3 } from '../services/upload.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let folder = req.body.folder || 'general';
    const assetType = req.body.assetType;
    if (assetType === 'user-profile' || assetType === 'staff-profile') {
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ message: 'Profile photos must be image files' });
      }
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ message: 'Profile photos must be smaller than 5 MB' });
      }
    }
    const userId = req.user!.id;
    const spId = req.body.spId || req.user!.serviceProviderId || 'general';

    if (assetType === 'user-profile') {
      folder = `user-profiles/${userId}`;
    } else if (assetType === 'staff-profile') {
      if (req.user!.role !== 'SP_SUPER_ADMIN' || !req.user!.serviceProviderId) {
        return res.status(403).json({ message: 'Only the service provider admin can upload staff profile images' });
      }
      folder = `service-providers/${req.user!.serviceProviderId}/staff-profiles`;
    } else if (assetType === 'sp-profile' || assetType === 'service-provider-logo') {
      folder = `service-providers/${spId}/profile`;
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
