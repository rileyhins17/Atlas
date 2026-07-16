import { z } from 'zod';

export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(80).optional(),
  timezone: z.string().default('UTC'),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UserDTO = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  timezone: z.string(),
});
export type UserDTO = z.infer<typeof UserDTO>;
