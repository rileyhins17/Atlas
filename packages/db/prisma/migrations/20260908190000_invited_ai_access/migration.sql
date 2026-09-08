-- Add eligibility without granting access to existing accounts or changing their data.
-- Revocation remains distinct from an unused invite so redemption cannot undo it.
ALTER TABLE "users"
  ADD COLUMN "aiAccessGrantedAt" TIMESTAMP(3),
  ADD COLUMN "aiAccessRevokedAt" TIMESTAMP(3);
