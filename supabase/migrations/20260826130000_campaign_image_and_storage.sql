-- Phase 4A: Campaign launch & approval support
-- Add image column and campaign summary fields

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS campaign_image_url TEXT;

-- Create storage bucket for campaign images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('campaign-images', 'campaign-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- RLS: users can only upload/read their own campaign images
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_images_insert') THEN
    CREATE POLICY "campaign_images_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'campaign-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_images_select') THEN
    CREATE POLICY "campaign_images_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'campaign-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_images_delete') THEN
    CREATE POLICY "campaign_images_delete" ON storage.objects
      FOR DELETE USING (bucket_id = 'campaign-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
