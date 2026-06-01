import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '../config/s3';
import { v4 as uuidv4 } from 'uuid';

export const uploadFileToS3 = async (
  file: Buffer,
  folder: string,
  contentType: string,
  fileName?: string
): Promise<string> => {
  const name = fileName || `${uuidv4()}`;
  const key = `${folder}/${name}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
    ACL: 'public-read',
  });

  await s3Client.send(command);

  // Return the public URL (or key if you prefer presigned URLs)
  // For production, usually CloudFront or presigned URLs are used.
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

export const getPresignedUrl = async (key: string, expiresIn: number = 3600): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};
