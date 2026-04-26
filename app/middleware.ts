import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./src/i18n";

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "never",
});

export const config = {
  matcher: ["/((?!api|.*\\..*|_next/static|_next/image|favicon.ico).*)"],
};