-- ============================================================
-- WEEKLY P&L - STAGE 3: tech home-silo pinning (Session 99)
-- Roland 2026-06-10: dedicated techs' hours ALWAYS attribute to
-- their home silo (clock-in selection ignored); 'Shop' clock-ins
-- stay overhead regardless. Floaters (Riley, Cooper, Tommy,
-- managers) attribute by clock-in service_type as before.
-- ============================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS pnl_home_silo TEXT;

UPDATE staff SET pnl_home_silo = 'roof'
WHERE email IN ('rod@patriotsrvservices.com',
                'zak@patriotsrvservices.com',
                'travis@patriotsrvservices.com');

UPDATE staff SET pnl_home_silo = 'solar'
WHERE email = 'tipton@patriotsrvservices.com';

UPDATE staff SET pnl_home_silo = 'repair'
WHERE email = 'ignacio@patriotsrvservices.com';

UPDATE staff SET pnl_home_silo = 'paint_body'
WHERE email = 'rudy@patriotsrvservices.com';

-- Floaters (explicitly NULL): cooper@, tommy@, solar@ (Riley),
-- all managers and sr_managers.

-- VERIFY (expect 6 rows):
SELECT name, email, pnl_home_silo FROM staff
WHERE pnl_home_silo IS NOT NULL ORDER BY pnl_home_silo, name;
