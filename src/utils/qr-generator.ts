import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';
import s3Client from '../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads';
const QR_PATH = path.join(UPLOAD_PATH, 'qrcodes');
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Ensure QR directory exists
const ensureQrDirectory = async () => {
  await fs.mkdir(QR_PATH, { recursive: true });
};

export const generateQRCode = async (
  data: string,
  filename: string
): Promise<string> => {
  const filePath = path.join(QR_PATH, `${filename}.png`);
  const logoPath = process.env.QR_CODE_LOGO_PATH || path.join(__dirname, '../../assets/freebiz-logo.png');

  const options: QRCode.QRCodeToBufferOptions = {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'H',
  };

  try {
    // Generate QR code as buffer
    const qrBuffer = await QRCode.toBuffer(data, options);
    let finalBuffer: Buffer = qrBuffer;
    
    // Try to overlay logo
    try {
      const sharp = require('sharp');
      const logoExists = await fs.access(logoPath).then(() => true).catch(() => false);
      
      if (logoExists) {
        const logoBuffer = await fs.readFile(logoPath);
        const logoSize = 80;
        const resizedLogo = await sharp(logoBuffer).resize(logoSize, logoSize).toBuffer();

        finalBuffer = await sharp(qrBuffer)
          .composite([{
            input: resizedLogo,
            top: Math.floor((400 - logoSize) / 2),
            left: Math.floor((400 - logoSize) / 2),
          }])
          .png()
          .toBuffer();
      }
    } catch (logoError) {
      console.warn('Logo overlay failed, using plain QR code');
    }

    // If AWS is configured, upload to S3
    if (BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID) {
      const key = `qrcodes/${filename}.png`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: finalBuffer,
        ContentType: 'image/png',
        ACL: 'public-read',
      }));
      return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
    }

    // Otherwise, save locally
    await ensureQrDirectory();
    await fs.writeFile(filePath, finalBuffer);
    return `/uploads/qrcodes/${filename}.png`;
    
  } catch (error: any) {
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};
