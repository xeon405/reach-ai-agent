-- Test-lead reset: un-suppress outreachai.team@gmail.com so live reply-detection
-- testing can continue (lead was suppressed during unsubscribe-flow verification)
UPDATE public.leads
SET unsubscribed = false,
    status = 'emailed'
WHERE id = '8e8bbc50-087d-491f-be2f-7ae3815e8432'
  AND email = 'outreachai.team@gmail.com';
