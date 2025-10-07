/*
  # Create Alerts Table for Sprint 1 & 2

  1. New Tables
    - `alerts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `offer_id` (uuid, references offers, nullable for global alerts)
      - `alert_type` (text) - types: 'ad_count_increase', 'ad_count_decrease', 'threshold_reached', 'inactivity'
      - `threshold_value` (integer, nullable) - for threshold-based alerts
      - `percentage_change` (integer, nullable) - for percentage-based alerts
      - `is_active` (boolean, default true)
      - `last_triggered` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `alerts` table
    - Add policies for authenticated users to manage their own alerts

  3. Indexes
    - Add indexes for performance on user_id and offer_id
*/

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES offers(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('ad_count_increase', 'ad_count_decrease', 'threshold_reached', 'inactivity', 'consistency_drop')),
  threshold_value integer,
  percentage_change integer,
  is_active boolean DEFAULT true,
  last_triggered timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on alerts table
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for alerts table
CREATE POLICY "Users can create their own alerts"
  ON alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own alerts"
  ON alerts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON alerts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON alerts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS alerts_user_id_idx ON alerts(user_id);
CREATE INDEX IF NOT EXISTS alerts_offer_id_idx ON alerts(offer_id);

-- Add trigger for updated_at column on alerts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_alerts_updated_at'
  ) THEN
    CREATE TRIGGER update_alerts_updated_at
      BEFORE UPDATE ON alerts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;