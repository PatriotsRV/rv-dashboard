-- [ER BUGFIX v1.458 S118] Keys + Power RO fields (ERs 34fc03c2 Brandon + b87eb2fb Lynn)
-- Additive only. key_status is free text (app constrains to keys / no_keys / keypad);
-- no CHECK constraint on purpose so future values do not require a migration.
ALTER TABLE public.repair_orders
  ADD COLUMN IF NOT EXISTS key_status      text,
  ADD COLUMN IF NOT EXISTS keypad_code     text,
  ADD COLUMN IF NOT EXISTS keep_plugged_in boolean NOT NULL DEFAULT false;
