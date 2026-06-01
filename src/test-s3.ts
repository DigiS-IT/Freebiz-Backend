import { S3Client, GetBucketLocationCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'special-nest-images-1984';

async function main() {
  console.log('Testing S3 configuration...');
  console.log('Bucket:', BUCKET_NAME);
  console.log('Region:', process.env.AWS_REGION);

  try {
    const loc = await s3Client.send(new GetBucketLocationCommand({ Bucket: BUCKET_NAME }));
    console.log('Bucket location:', loc.LocationConstraint);
  } catch (error) {
    console.error('Error getting bucket location:', error);
  }
}

main();
