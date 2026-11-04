/** DI tokens live in a dependency-free module so providers can import them without creating ESM cycles. */
export const PRISMA = Symbol('PRISMA');
export const REDIS = Symbol('REDIS');
