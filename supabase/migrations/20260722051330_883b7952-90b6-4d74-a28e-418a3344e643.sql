CREATE TABLE public.quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quote_items_quote_id_idx ON public.quote_items(quote_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO anon, authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access quote_items" ON public.quote_items FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER set_updated_at_quote_items BEFORE UPDATE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS vat_amount NUMERIC;