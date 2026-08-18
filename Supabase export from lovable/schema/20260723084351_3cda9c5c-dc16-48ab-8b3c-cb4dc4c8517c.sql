
CREATE TABLE public.followup_remarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead','quote')),
  entity_id UUID NOT NULL,
  remark TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_remarks_entity ON public.followup_remarks (entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_remarks TO authenticated;
GRANT ALL ON public.followup_remarks TO service_role;

ALTER TABLE public.followup_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view remarks"
  ON public.followup_remarks FOR SELECT
  TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert own remarks"
  ON public.followup_remarks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Author can update own remarks"
  ON public.followup_remarks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Author can delete own remarks"
  ON public.followup_remarks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
