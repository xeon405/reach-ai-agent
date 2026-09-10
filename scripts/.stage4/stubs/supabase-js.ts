// Harness stub for supabase-js — createClient is only called inside the serve
// handler (never executed under test); the fold functions receive the fake db.
export function createClient(..._args: unknown[]): unknown {
  throw new Error("createClient must not be called in Stage-4 fold tests");
}