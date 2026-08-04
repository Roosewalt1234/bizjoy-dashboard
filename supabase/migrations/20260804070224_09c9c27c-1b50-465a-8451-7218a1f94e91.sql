CREATE POLICY "service_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'service-photos' AND app_private.can(auth.uid(), 'service', 'view'));
CREATE POLICY "service_photos_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-photos' AND app_private.can(auth.uid(), 'service', 'add'));
CREATE POLICY "service_photos_modify" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'service-photos' AND app_private.can(auth.uid(), 'service', 'edit'))
  WITH CHECK (bucket_id = 'service-photos' AND app_private.can(auth.uid(), 'service', 'edit'));
CREATE POLICY "service_photos_remove" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'service-photos' AND app_private.can(auth.uid(), 'service', 'delete'));