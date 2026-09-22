import { jsx } from "react/jsx-runtime";
import { u as useLang } from "./router-DM9FrBM_.js";
function EnOnlyNotice() {
  const { lang } = useLang();
  if (lang !== "ar") return null;
  return /* @__PURE__ */ jsx("div", { className: "mx-auto mb-6 max-w-5xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-600 dark:text-amber-400", dir: "rtl", children: "هذه الصفحة متوفرة باللغة الإنجليزية حالياً — فريقنا يعمل على ترجمتها قريباً." });
}
export {
  EnOnlyNotice as E
};
//# sourceMappingURL=EnOnlyNotice-B_714PD4.js.map
