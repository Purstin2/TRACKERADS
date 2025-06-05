/*
  # Add Ad Counts and Comments Tables

  1. New Tables
    - `ad_counts`
      - `id` (uuid, primary key)
      - `offer_id` (uuid, references offers)
      - `user_id` (uuid, references auth.users)
      - `count` (integer)
      - `timestamp` (timestamptz)
    
    - `comments`
      - `id` (uuid, primary key)
      - `offer_id` (uuid, references offers)
      - `user_id` (uuid, references auth.users)
      - `text` (text)
      - `timestamp` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to:
      - Read their own data
      - Create new records
      - Delete their own records
*/

-- Create ad_counts table
CREATE TABLE IF NOT EXISTS ad_counts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id uuid REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    count integer NOT NULL,
    timestamp timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for ad_counts
ALTER TABLE ad_counts ENABLE ROW LEVEL SECURITY;

-- Create policies for ad_counts
CREATE POLICY "Users can read their own ad counts"
    ON ad_counts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create ad counts"
    ON ad_counts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ad counts"
    ON ad_counts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX ad_counts_offer_id_idx ON ad_counts(offer_id);
CREATE INDEX ad_counts_timestamp_idx ON ad_counts(timestamp);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id uuid REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    text text NOT NULL,
    timestamp timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Create policies for comments
CREATE POLICY "Users can read their own comments"
    ON comments
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create comments"
    ON comments
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
    ON comments
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX comments_offer_id_idx ON comments(offer_id);
CREATE INDEX comments_timestamp_idx ON comments(timestamp);