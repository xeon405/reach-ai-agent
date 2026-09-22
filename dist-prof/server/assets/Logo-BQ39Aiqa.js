import { jsxs, jsx } from "react/jsx-runtime";
import { Zap } from "lucide-react";
function Logo({ className = "" }) {
  return /* @__PURE__ */ jsxs("div", { className: `flex items-center gap-2 font-semibold tracking-tight ${className}`, children: [
    /* @__PURE__ */ jsx("span", { className: "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow", children: /* @__PURE__ */ jsx(Zap, { className: "h-4 w-4 text-primary-foreground", strokeWidth: 2.5 }) }),
    /* @__PURE__ */ jsx("span", { className: "text-lg group-data-[collapsible=icon]:hidden", children: "OutreachAI" })
  ] });
}
export {
  Logo as L
};
//# sourceMappingURL=Logo-BQ39Aiqa.js.map
