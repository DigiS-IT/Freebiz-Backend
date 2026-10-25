/** Keep development and production uploads in separate S3 prefixes. */
export const getEnvironmentS3Key = (folder: string, fileName: string): string => {
  const environmentFolder = process.env.NODE_ENV === 'production' ? 'production' : 'dev';
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  return `FreeBiz/${environmentFolder}/${cleanFolder}/${fileName}`;
};
