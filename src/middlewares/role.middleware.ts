import { AuthRequest, authorize } from './auth.middleware';

// Customer only
export const customerOnly = authorize('CUSTOMER');

// SP roles (both SP Super Admin and Mobile SP)
export const spOnly = authorize('SP_SUPER_ADMIN', 'MOBILE_SP');

// SP Super Admin only (full web portal access)
export const spSuperAdminOnly = authorize('SP_SUPER_ADMIN');

// Mobile SP only (QR scanning)
export const mobileSpOnly = authorize('MOBILE_SP');

// Super Admin only
export const superAdminOnly = authorize('SUPER_ADMIN');

// SP or Super Admin
export const spOrSuperAdmin = authorize('SP_SUPER_ADMIN', 'MOBILE_SP', 'SUPER_ADMIN');
