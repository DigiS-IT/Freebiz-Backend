import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Client, { bucketName } from '../config/aws';
import { v4 as uuidv4 } from 'uuid';

export const uploadFile = async (
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> => {
  const fileExtension = fileName.split('.').pop();
  const key = `FreeBiz/uploads/${uuidv4()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  // Return the public URL or the key
  // For AWS S3, standard URL format: https://BUCKET.s3.REGION.amazonaws.com/KEY
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

export const getPresignedUrl = async (key: string): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  // URL valid for 1 hour
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};
