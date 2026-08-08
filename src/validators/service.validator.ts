import { z } from 'zod';

export const getServicesSchema = z.object({
  serviceType: z.enum(['FREE', 'DISCOUNTED']).optional(),
  city: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  minDiscount: z.string().optional(),
  search: z.string().optional(),
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

export const updateServiceSchema = z.object({
  serviceType: z.enum(['FREE', 'DISCOUNTED']).optional(),
  serviceDetail: z.string().min(10).optional(),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
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
