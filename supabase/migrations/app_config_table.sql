CREATE TABLE IF NOT EXISTS app_config (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL,
    label   TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config
CREATE POLICY "config_select_authenticated"
  ON app_config FOR SELECT TO authenticated USING (true);

-- Only Admins can write config
CREATE POLICY "config_write_admin"
  ON app_config FOR ALL TO authenticated
  USING (has_role('Admin')) WITH CHECK (has_role('Admin'));

-- Seed with current Calendar IDs
INSERT INTO app_config (key, value, label) VALUES
  ('calendar_id_roof',          'c_23890bb21428b7a92b1f942387a4ea769f4b00b9a08a2448ccbd31e0f1f0234d@group.calendar.google.com', 'Roof Calendar ID'),
  ('calendar_id_solar',         'c_f7395ae6ecb439db38486d6aa9750c15dadbf34e7c29b0cdf64e0d5b0bfc1b95@group.calendar.google.com', 'Solar Calendar ID'),
  ('calendar_id_vroom',         'c_5ih1tgaloe3kitrpidg2fttrgk@group.calendar.google.com', 'Vroom Calendar ID'),
  ('calendar_id_repairs',       'c_44c8f542bbfa7b68f7414af2d2548d495a25b4a00ee9e4c7081ff0b46d1e7316@group.calendar.google.com', 'Repairs Calendar ID'),
  ('calendar_id_truetopper',    'c_be232eeb5a69d31311ee16f4aafc5988999223207b34d28ef93ff4094a0de891@group.calendar.google.com', 'TrueTopper Calendar ID'),
  ('calendar_id_paint_and_body','c_911600141e4e8e889da76b4dfe294277016b68d2cae7d3d4523dab46ada7cc99@group.calendar.google.com', 'Paint & Body Calendar ID'),
  ('calendar_id_detailing',     'c_121e30023259fa55ae879ae30dab545b9a49c6d88b27bc8a5113b9ab20c8a88e@group.calendar.google.com', 'Detailing Calendar ID'),
  ('calendar_id_chassis',       'c_00fe106cb9b6c88fd83296d6bc2afde52b94fd5a5a46e598f0d8d9447fefaf0e@group.calendar.google.com', 'Chassis Calendar ID')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
