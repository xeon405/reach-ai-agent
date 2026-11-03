-- ============================================================
-- ADMIN CONSOLE — part 1 of 2: who is an admin, and the read model
--
-- Until now the anti-abuse tables (signup_signals, admin-free) had no reader.
-- The operator could only find out that something was wrong by reading the API
-- by hand, which is the same as having no visibility at all.
--
-- Three deliberate choices:
--
--   * Admins live in their own table, not a `profiles.is_admin` column.
--     profiles is a table the user can UPDATE. A boolean there would be one
--     forgotten guard away from any user promoting themselves. A separate table
--     has no write path for `authenticated` at all.
--
--   * Every read goes through one SECURITY DEFINER function that checks
--     is_admin() first. We do not grant SELECT on signup_signals/domains to
--     authenticated and then hope RLS is right — the tables stay closed.
--
--   * This function is read-only. Actions are separate, smaller functions, so
--     a bug in the read model can never change a flag.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
-- No policies, and no grant: no client, signed in or not, can read this table.
-- Read it with the service role or through is_admin().
REVOKE ALL ON public.admins FROM anon, authenticated;
GRANT ALL ON public.admins TO service_role;

-- Audit trail for manual decisions. Anti-abuse actions taken by a human should
-- be answerable later ("why was this account allowed?") without guessing.
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid,
  target_id  uuid,
  action     text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_actions FROM anon, authenticated;
GRANT ALL ON public.admin_actions TO service_role;

CREATE INDEX IF NOT EXISTS admin_actions_target_idx
  ON public.admin_actions (target_id, created_at DESC);

-- ============================================================
-- is_admin()
--
-- No arguments on purpose. A function taking a uuid would let any signed-in
-- user ask "is this other user an admin?" — a small leak, but a free one to
-- avoid. It always answers about the caller.
--
-- auth.uid() is NULL for the service role and for anon, so both get false. The
-- service role does not need this function; it can read the table directly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  )
$fn$;

COMMENT ON FUNCTION public.is_admin() IS
  'True when the caller is in public.admins. Read by the admin console and every admin_* action.';

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ============================================================
-- admin_console() — one read, one round trip
--
-- Returns a single jsonb document instead of five queries, so the page cannot
-- show a half-loaded picture (accounts from one moment, flags from another).
--
-- The interesting part is `clusters`. We never block a device, so the only way
-- to spot one person with many accounts is that several accounts share a device
-- id or an IP hash. Those clusters are ranked first, because that is the actual
-- signal; a lone flagged account is usually just someone who mistyped.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_console()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'accounts',        (SELECT count(*) FROM public.profiles),
      'signups_7d',      (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
      'flagged',         (SELECT count(*) FROM public.profiles WHERE domain_required),
      'verified_domains',(SELECT count(*) FROM public.domains WHERE verified_at IS NOT NULL),
      'emails_sent',     (SELECT coalesce(sum(emails_sent_total), 0) FROM public.profiles),
      'address_missing', (SELECT count(*) FROM public.profiles
                           WHERE coalesce(btrim(company), '') <> ''
                             AND NOT public.is_plausible_business_address(business_address))
    ),
    'accounts', coalesce((
      SELECT jsonb_agg(row_to_json(a)::jsonb)
      FROM (
        SELECT
          p.id,
          p.created_at,
          p.email,
          p.name,
          p.company,
          p.business_address,
          p.plan,
          p.domain_required,
          p.domain_verified,
          p.gmail_connected,
          coalesce(p.emails_sent_total, 0)  AS emails_total,
          coalesce(p.emails_sent_today, 0)  AS emails_today,
          public.is_plausible_business_address(p.business_address) AS address_ok,
          (SELECT count(*) FROM public.signup_signals s WHERE s.user_id = p.id) AS signal_count,
          (SELECT jsonb_agg(DISTINCT s.device_id)
             FROM public.signup_signals s
            WHERE s.user_id = p.id AND s.device_id IS NOT NULL) AS devices,
          (SELECT jsonb_agg(DISTINCT s.ip_hash)
             FROM public.signup_signals s
            WHERE s.user_id = p.id AND s.ip_hash IS NOT NULL) AS ips
        FROM public.profiles p
        ORDER BY p.created_at DESC
        LIMIT 200
      ) a
    ), '[]'::jsonb),
    -- Several accounts on one device, or one IP. This is the free-trial farming
    -- signal we can act on without blocking anyone.
    'clusters', coalesce((
      SELECT jsonb_agg(row_to_json(c)::jsonb ORDER BY c.accounts DESC)
      FROM (
        SELECT * FROM (
          SELECT
            'device'::text AS kind,
            s.device_id    AS value,
            count(DISTINCT s.user_id) AS accounts,
            jsonb_agg(DISTINCT jsonb_build_object(
              'id', p.id, 'email', p.email, 'company', p.company,
              'created_at', p.created_at, 'plan', p.plan,
              'domain_required', p.domain_required)) AS who
          FROM public.signup_signals s
          JOIN public.profiles p ON p.id = s.user_id
          WHERE s.device_id IS NOT NULL
          GROUP BY s.device_id
          HAVING count(DISTINCT s.user_id) > 1

          UNION ALL

          SELECT
            'ip'::text,
            s.ip_hash,
            count(DISTINCT s.user_id),
            jsonb_agg(DISTINCT jsonb_build_object(
              'id', p.id, 'email', p.email, 'company', p.company,
              'created_at', p.created_at, 'plan', p.plan,
              'domain_required', p.domain_required))
          FROM public.signup_signals s
          JOIN public.profiles p ON p.id = s.user_id
          WHERE s.ip_hash IS NOT NULL
          GROUP BY s.ip_hash
          HAVING count(DISTINCT s.user_id) > 1
        ) u
        ORDER BY accounts DESC
        LIMIT 40
      ) c
    ), '[]'::jsonb),
    'domains', coalesce((
      SELECT jsonb_agg(row_to_json(d)::jsonb)
      FROM (
        SELECT dm.domain, dm.verified_at, dm.created_at,
               p.email, p.company, dm.user_id
        FROM public.domains dm
        LEFT JOIN public.profiles p ON p.id = dm.user_id
        ORDER BY dm.created_at DESC
        LIMIT 50
      ) d
    ), '[]'::jsonb),
    'signals', coalesce((
      SELECT jsonb_agg(row_to_json(s)::jsonb)
      FROM (
        SELECT ss.created_at, ss.device_id, ss.ip_hash, ss.user_agent,
               p.email, p.company, ss.user_id
        FROM public.signup_signals ss
        LEFT JOIN public.profiles p ON p.id = ss.user_id
        ORDER BY ss.created_at DESC
        LIMIT 50
      ) s
    ), '[]'::jsonb),
    'actions', coalesce((
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT aa.created_at, aa.action, aa.note, aa.actor_id, aa.target_id,
               tp.email AS target_email
        FROM public.admin_actions aa
        LEFT JOIN public.profiles tp ON tp.id = aa.target_id
        ORDER BY aa.created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $fn$;

COMMENT ON FUNCTION public.admin_console() IS
  'Read-only admin snapshot: totals, accounts, device/IP clusters, domains, raw signals, action history. Raises 42501 unless the caller is in public.admins.';

GRANT EXECUTE ON FUNCTION public.admin_console() TO authenticated, service_role;

-- ============================================================
-- Actions. Small, separate, and audited.
--
-- Both are reversible by design: nothing here deletes or suspends an account.
-- They only move the duplicate-business flag, which is the one decision a human
-- is better at than the trigger. Deleting a customer needs a human running SQL
-- on purpose, not a button that can be misclicked.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_clear_flag(p_user uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
    RAISE EXCEPTION 'no_such_account' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET domain_required = false WHERE id = p_user;

  INSERT INTO public.admin_actions (actor_id, target_id, action, note)
  VALUES (auth.uid(), p_user, 'clear_flag', nullif(btrim(coalesce(p_note, '')), ''));
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_flag(p_user uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
    RAISE EXCEPTION 'no_such_account' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET domain_required = true WHERE id = p_user;

  INSERT INTO public.admin_actions (actor_id, target_id, action, note)
  VALUES (auth.uid(), p_user, 'flag', nullif(btrim(coalesce(p_note, '')), ''));
END $fn$;

GRANT EXECUTE ON FUNCTION public.admin_clear_flag(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_flag(uuid, text) TO authenticated, service_role;
