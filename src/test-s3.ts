import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
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
  console.log('Listing S3 objects...');
  console.log('Bucket:', BUCKET_NAME);

  try {
    const data = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
    console.log('Objects:');
    if (data.Contents) {
      data.Contents.forEach((obj) => {
        console.log(` - ${obj.Key} (Size: ${obj.Size})`);
      });
    } else {
      console.log('No objects found in bucket.');
    }
  } catch (error) {
    console.error('Error listing objects:', error);
  }
}

main();
