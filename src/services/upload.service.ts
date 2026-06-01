import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Client from '../config/aws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

export const uploadToS3 = async (
  file: Express.Multer.File,
  folder: string = 'uploads'
): Promise<string> => {
  const fileExtension = path.extname(file.originalname);
  const fileName = `FreeBiz/${folder}/${uuidv4()}${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read',
  });

  await s3Client.send(command);

  // Return the full public S3 URL of the uploaded file
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${fileName}`;
};

export const getPresignedUrl = async (key: string): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  // URL expires in 1 hour
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};
