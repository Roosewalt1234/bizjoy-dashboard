
-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_type TEXT NOT NULL DEFAULT 'Business' CHECK (customer_type IN ('Business','Individual')),
  salutation TEXT,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  work_phone TEXT,
  mobile TEXT,
  language TEXT,
  currency TEXT CHECK (currency IN ('AED','Euro','USD')),
  opening_balance NUMERIC DEFAULT 0,
  payment_terms TEXT,
  portal_enabled BOOLEAN DEFAULT FALSE,
  -- customer address
  address_line TEXT,
  address_city TEXT,
  address_country TEXT,
  address_lat NUMERIC,
  address_lng NUMERIC,
  address_telephone TEXT,
  address_mobile TEXT,
  -- billing address
  billing_address_line TEXT,
  billing_city TEXT,
  billing_country TEXT,
  billing_lat NUMERIC,
  billing_lng NUMERIC,
  billing_telephone TEXT,
  billing_mobile TEXT,
  special_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  first_name TEXT,
  second_name TEXT,
  last_name TEXT,
  email TEXT,
  work_phone TEXT,
  mobile TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO anon, authenticated;
GRANT ALL ON public.customer_contacts TO service_role;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access contacts" ON public.customer_contacts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO anon, authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access documents" ON public.customer_documents FOR ALL USING (true) WITH CHECK (true);

-- Sales orders
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Draft',
  order_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO anon, authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access sales" ON public.sales_orders FOR ALL USING (true) WITH CHECK (true);

-- Employees (HR)
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  position TEXT,
  department TEXT,
  salary NUMERIC,
  hire_date DATE,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO anon, authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- Account transactions
CREATE TABLE public.accounts_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE DEFAULT CURRENT_DATE,
  type TEXT CHECK (type IN ('Income','Expense')),
  category TEXT,
  description TEXT,
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_transactions TO anon, authenticated;
GRANT ALL ON public.accounts_transactions TO service_role;
ALTER TABLE public.accounts_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access accounts" ON public.accounts_transactions FOR ALL USING (true) WITH CHECK (true);

-- Contracts
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  start_date DATE,
  end_date DATE,
  value NUMERIC,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO anon, authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access contracts" ON public.contracts FOR ALL USING (true) WITH CHECK (true);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'Planning',
  budget NUMERIC,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger for customers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
