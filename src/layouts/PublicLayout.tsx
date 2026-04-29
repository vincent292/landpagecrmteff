import { Outlet } from "react-router-dom";

import { Footer } from "../components/layout/Footer";
import { PremiumNavbar } from "../components/layout/PremiumNavbar";
import { WhatsAppButton } from "../components/platform/WhatsAppButton";

export function PublicLayout() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-base)_0%,#fff9f4_48%,var(--color-surface-soft)_100%)] text-[var(--color-ink)]">
      <PremiumNavbar />
      <div className="pt-24 sm:pt-28">
        <Outlet />
      </div>
      <Footer />
      <WhatsAppButton />
    </main>
  );
}
