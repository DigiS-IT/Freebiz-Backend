import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET_NAME || '';
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'general'): Promise<string> {
    const fileExtension = path.extname(file.originalname);
    const fileName = `FreeBiz/${folder}/${uuidv4()}${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    });

    await this.client.send(command);
    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract key from URL
      const key = fileUrl.split(`${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/`)[1];
      if (!key) return;

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('S3 Delete Error:', error);
    }
  }
}

export default new S3Service();
