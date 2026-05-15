-- ============================================
-- TRACKERADS - SETUP COMPLETO DO BANCO DE DADOS
-- Execute este script no SQL Editor do Supabase
-- ============================================

-- 1. CREATE OFFERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  link text NOT NULL,
  tags text[] DEFAULT '{}',
  category text,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  last_ad_count integer DEFAULT 0,
  last_ad_count_timestamp timestamptz,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own offers"
  ON offers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create offers"
  ON offers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own offers"
  ON offers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own offers"
  ON offers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS offers_user_id_idx ON offers(user_id);
CREATE INDEX IF NOT EXISTS offers_is_archived_idx ON offers(is_archived);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for offers
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- 2. CREATE AD_COUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ad_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  count integer NOT NULL,
  timestamp timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE ad_counts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own ad counts"
  ON ad_counts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create ad counts"
  ON ad_counts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ad counts"
  ON ad_counts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS ad_counts_offer_id_idx ON ad_counts(offer_id);
CREATE INDEX IF NOT EXISTS ad_counts_timestamp_idx ON ad_counts(timestamp);


-- 3. CREATE COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  text text NOT NULL,
  timestamp timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own comments"
  ON comments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create comments"
  ON comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS comments_offer_id_idx ON comments(offer_id);
CREATE INDEX IF NOT EXISTS comments_timestamp_idx ON comments(timestamp);


-- 4. CREATE NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  text text NOT NULL,
  date timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create their own notes"
  ON notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own notes"
  ON notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
  ON notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);
CREATE INDEX IF NOT EXISTS notes_date_idx ON notes(date);

-- Trigger for notes
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- 5. CREATE ALERTS TABLE
-- ============================================
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

-- Enable RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create their own alerts"
  ON alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own alerts"
  ON alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON alerts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON alerts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS alerts_user_id_idx ON alerts(user_id);
CREATE INDEX IF NOT EXISTS alerts_offer_id_idx ON alerts(offer_id);

-- Trigger for alerts
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

-- ============================================
-- SETUP COMPLETO! ✅
-- ============================================
-- Tabelas criadas:
-- ✅ offers (ofertas/targets)
-- ✅ ad_counts (histórico de contagens)
-- ✅ comments (notas táticas)
-- ✅ notes (notas gerais)
-- ✅ alerts (sistema de alertas)
--
-- Tudo configurado com RLS (Row Level Security)
-- ============================================
