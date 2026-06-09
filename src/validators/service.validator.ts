import { z } from 'zod';

export const getServicesSchema = z.object({
  type: z.enum(['FREE', 'DISCOUNTED', 'ALL']).optional(),
  city: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  minDiscount: z.string().optional(),
  query: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const createServiceSchema = z.object({
  serviceType: z.enum(['FREE', 'DISCOUNTED']),
  serviceDetail: z.string().min(10),
  contactNumber: z.string(),
  address: z.string(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  specialInstructions: z.string().optional().nullable(),
  termsAndConditions: z.string().optional().nullable(),
  actualPrice: z.number().optional().nullable(),
  discountedPrice: z.number().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  media: z.array(
    z.object({
      mediaType: z.enum(['PHOTO', 'VIDEO']),
      mediaUrl: z.string(),
      thumbnailUrl: z.string().optional().nullable(),
      order: z.number().optional(),
    })
  ).optional(),
});
