import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BranchesSection } from "@/components/BranchesSection";
import { ChangePasswordSection } from "@/components/ChangePasswordSection";
import { ContactHQSection } from "@/components/ContactHQSection";
import { QrPosterCard } from "@/components/settings/QrPosterCard";
import { VisitingCardCard } from "@/components/settings/VisitingCardCard";
import { TableQrPostersCard } from "@/components/settings/TableQrPostersCard";
import { AuditLogCard } from "@/components/settings/AuditLogCard";
import { DevicesCard } from "@/components/settings/DevicesCard";
import { ProfileCompletenessCard } from "@/components/settings/ProfileCompletenessCard";
import { BrandingCard } from "@/components/settings/BrandingCard";
import { GalleryCard } from "@/components/settings/GalleryCard";
import { TaxCard } from "@/components/settings/TaxCard";
import { LoyaltyCard } from "@/components/settings/LoyaltyCard";
import { AffiliateCard } from "@/components/settings/AffiliateCard";
import { RazorpayCard } from "@/components/settings/RazorpayCard";
import { ColorTryOnCard } from "@/components/settings/ColorTryOnCard";
import { InvoicesCard } from "@/components/settings/InvoicesCard";
import { AccountProfileCard } from "@/components/settings/AccountProfileCard";
import { GiftCardsCard } from "@/components/settings/GiftCardsCard";
import { StripeSubscriptionCard } from "@/components/settings/StripeSubscriptionCard";
import { VendorsCard } from "@/components/settings/VendorsCard";
import { BirthdayCard } from "@/components/settings/BirthdayCard";
import { AttendanceFinesCard } from "@/components/settings/AttendanceFinesCard";
import { PreviousStaffCard } from "@/components/settings/PreviousStaffCard";
import { InternationalCard } from "@/components/settings/InternationalCard";
import { SmsPacksCard } from "@/components/settings/SmsPacksCard";
import { SecurityPinCard } from "@/components/settings/SecurityPinCard";
import { UpdatedBillsCard } from "@/components/settings/UpdatedBillsCard";
import { RateMiracurlCard } from "@/components/settings/RateMiracurlCard";
import { SocialConnectionsCard } from "@/components/settings/SocialConnectionsCard";
import { MiracurlProductsCard } from "@/components/settings/MiracurlProductsCard";
import { LoyaltyStampsCard } from "@/components/settings/LoyaltyStampsCard";
import { RewardsQrCard } from "@/components/settings/RewardsQrCard";
import { CampaignAgreementCard } from "@/components/settings/CampaignAgreementCard";
import { NotifyEmailCard } from "@/components/NotifyEmailCard";
import { GrowthAdvisoryCard } from "@/components/settings/GrowthAdvisoryCard";
import { ReferEarnCard } from "@/components/settings/ReferEarnCard";

export default function Settings() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  useEffect(() => {
    if (window.location.hash !== "#subscription") return;
    let tries = 0;
    const iv = setInterval(() => {
      const el = document.getElementById("subscription") || document.getElementById("subscription-intl");
      if (el || ++tries > 20) { clearInterval(iv); el?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }, 300);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" data-testid="settings-page">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-800">{resto ? "Restaurant Settings" : "Salon Settings"}</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how billing, tax and your business identity behave on invoices.</p>

        <ProfileCompletenessCard />

        <QrPosterCard />
        <VisitingCardCard />

        <TableQrPostersCard />

        <div className="mt-6">
          <BranchesSection />
        </div>

        <ChangePasswordSection />

        <DevicesCard />

        <ContactHQSection />

        <BrandingCard />

        <GalleryCard />

        <TaxCard />

        <AttendanceFinesCard />

        <InternationalCard />

        <PreviousStaffCard />

        <SecurityPinCard />

        <AuditLogCard />

        <UpdatedBillsCard />

        <SocialConnectionsCard />

        <ReferEarnCard />

        <NotifyEmailCard />
        <LoyaltyStampsCard />
        <CampaignAgreementCard />
        <RewardsQrCard />
        <GrowthAdvisoryCard />
        <MiracurlProductsCard />

        <SmsPacksCard />

        <RateMiracurlCard />

        <div className="mt-6">
          <VendorsCard />
        </div>

        <LoyaltyCard />

        <div className="mt-6">
          <BirthdayCard />
        </div>

        <AffiliateCard />

        <ColorTryOnCard />

        <StripeSubscriptionCard />

        <RazorpayCard />

        <InvoicesCard />
        <AccountProfileCard tenant={tenant} />

        <GiftCardsCard />

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
