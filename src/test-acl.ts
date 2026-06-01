import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
  console.log('Testing public-read ACL upload...');
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'FreeBiz/test-public.txt',
      Body: Buffer.from('hello public'),
      ContentType: 'text/plain',
      ACL: 'public-read',
    });

    await s3Client.send(command);
    console.log('Upload with public-read ACL succeeded!');
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/FreeBiz/test-public.txt`;
    console.log('Checking if public URL is readable...');
    const res = await fetch(url);
    if (res.ok) {
      console.log('Successfully read public URL! Content:', await res.text());
    } else {
      console.log('Failed to read public URL. Status:', res.status, res.statusText);
    }
  } catch (error: any) {
    console.error('Failed to upload with public-read ACL:', error.message || error);
  }
}

main();
