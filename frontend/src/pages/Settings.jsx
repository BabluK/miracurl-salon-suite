import { ShieldCheck } from "lucide-react";
import { BranchesSection } from "@/components/BranchesSection";
import { ChangePasswordSection } from "@/components/ChangePasswordSection";
import { ContactHQSection } from "@/components/ContactHQSection";
import { QrPosterCard } from "@/components/settings/QrPosterCard";
import { ProfileCompletenessCard } from "@/components/settings/ProfileCompletenessCard";
import { BrandingCard } from "@/components/settings/BrandingCard";
import { TaxCard } from "@/components/settings/TaxCard";
import { LoyaltyCard } from "@/components/settings/LoyaltyCard";
import { AffiliateCard } from "@/components/settings/AffiliateCard";
import { RazorpayCard } from "@/components/settings/RazorpayCard";

export default function Settings() {
  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" data-testid="settings-page">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-800">Salon Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how billing, tax and your business identity behave on invoices.</p>

        <ProfileCompletenessCard />

        <QrPosterCard />

        <div className="mt-6">
          <BranchesSection />
        </div>

        <ChangePasswordSection />

        <ContactHQSection />

        <BrandingCard />

        <TaxCard />

        <LoyaltyCard />

        <AffiliateCard />

        <RazorpayCard />

        <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Data isolation</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your salon&apos;s customers, invoices and staff are isolated by tenant ID and never visible to other salons on Miracurl.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
