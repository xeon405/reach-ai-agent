-- Second test-lead reset (Gmail one-click retries likely re-suppressed it)
UPDATE public.leads
SET unsubscribed = false,
    status = 'emailed'
WHERE id = '8e8bbc50-087d-491f-be2f-7ae3815e8432'
  AND email = 'outreachai.team@gmail.com';
