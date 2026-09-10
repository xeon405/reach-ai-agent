// Deno polyfill for Node harnesses. Imported BEFORE the gate bundle so module
// top-level `Deno.env.get(...)` works. Unset vars fall back to built-in defaults.
globalThis.Deno = {
  env: {
    get: (k) => process.env[k] ?? null,
  },
};