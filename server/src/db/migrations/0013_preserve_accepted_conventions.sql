UPDATE "conventions"
SET "status" = 'accepted'
WHERE "accepted" = true AND "status" = 'pending';
