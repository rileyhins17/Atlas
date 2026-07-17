import { z } from 'zod';

// Hard account deletion is irreversible and wipes sensitive data (journal,
// finance), so it re-authenticates: the current password must be supplied even
// though the caller already holds a session.
export const DeleteAccountInput = z.object({
  password: z.string().min(1, 'Password is required to delete your account'),
  // Extra intent guard against a mis-click / CSRF-adjacent trigger.
  confirm: z.literal('DELETE'),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;
