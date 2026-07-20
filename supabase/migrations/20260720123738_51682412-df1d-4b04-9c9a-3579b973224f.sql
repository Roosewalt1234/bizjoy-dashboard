
CREATE POLICY "Anyone read customer-documents" ON storage.objects FOR SELECT USING (bucket_id = 'customer-documents');
CREATE POLICY "Anyone insert customer-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'customer-documents');
CREATE POLICY "Anyone update customer-documents" ON storage.objects FOR UPDATE USING (bucket_id = 'customer-documents');
CREATE POLICY "Anyone delete customer-documents" ON storage.objects FOR DELETE USING (bucket_id = 'customer-documents');
