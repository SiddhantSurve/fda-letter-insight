CREATE TABLE public.videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  channel_title TEXT,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  video_url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  summary TEXT,
  summarized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.videos TO anon;
GRANT SELECT ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Videos are publicly readable" ON public.videos FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX videos_published_at_idx ON public.videos (published_at DESC NULLS LAST);

CREATE TABLE public.video_notifications_sent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);
GRANT SELECT ON public.video_notifications_sent TO authenticated;
GRANT ALL ON public.video_notifications_sent TO service_role;
ALTER TABLE public.video_notifications_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own video notifications" ON public.video_notifications_sent FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS notify_videos BOOLEAN NOT NULL DEFAULT true;