-- Failed logins kept the first 60 characters typed in the address box, which can be a password.
-- Only text that looks like an address stays.
UPDATE "audit_log" SET "detail" = "detail" - 'email'
WHERE "action" = 'login.failed' AND "detail" ? 'email' AND position('@' in coalesce("detail"->>'email', '')) = 0;
--> statement-breakpoint
-- Cat edits kept the old and new value of fields that can hold contact details, and of the microchip.
-- They now record only that the field changed.
UPDATE "audit_log" SET "detail" = (
  SELECT jsonb_object_agg(key, CASE WHEN key = ANY (k.private) THEN '"changed"'::jsonb ELSE value END)
  FROM jsonb_each("detail")
)
FROM (SELECT array[
  'color', 'healthBookNo', 'passport', 'microchip', 'locationNote', 'currentTreatment', 'intakeHistory',
  'medicalSummary', 'otherInfo', 'refillNotes', 'deathNote', 'contractText', 'birthText', 'intakeText', 'sterilizedText'
] private) k
WHERE "action" = 'animal.update' AND jsonb_typeof("detail") = 'object' AND "detail" ?| k.private;
