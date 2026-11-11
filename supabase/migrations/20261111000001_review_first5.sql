-- The review period is the first 5 emails, not 20.
--
-- Five is the smallest number that still catches a bad prompt, a wrong tone or a
-- bad offer in the first session. Twenty turned the first day into paperwork.
-- The rule lives in supabase/functions/_shared/review-mode.ts; this only moves
-- the stored values and the default. No constraint is added on purpose: an old
-- client that still writes 'first_20' must not get an error, and the shared rule
-- already treats every unknown value as review-on.
UPDATE public.profiles
   SET review_mode = 'first_5'
 WHERE review_mode = 'first_20';

ALTER TABLE public.profiles
  ALTER COLUMN review_mode SET DEFAULT 'first_5';

COMMENT ON COLUMN public.profiles.review_mode IS
  'first_5 (default) | always | off. Unknown values fail safe to review.';
