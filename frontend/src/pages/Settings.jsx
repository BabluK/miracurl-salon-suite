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
import { WhatsAppLinkCard } from "@/components/settings/WhatsAppLinkCard";
import { OwnWhatsAppCard } from "@/components/settings/OwnWhatsAppCard";
import { PaymentsInvoicesCard } from "@/components/settings/PaymentsInvoicesCard";
import { PasskeyManagerCard } from "@/components/settings/PasskeyManagerCard";
import { MiracurlProductsCard } from "@/components/settings/MiracurlProductsCard";
import { LoyaltyStampsCard } from "@/components/settings/LoyaltyStampsCard";
import { RewardsQrCard } from "@/components/settings/RewardsQrCard";
import { CampaignAgreementCard } from "@/components/settings/CampaignAgreementCard";
import { NotifyEmailCard } from "@/components/NotifyEmailCard";
import { GrowthAdvisoryCard } from "@/components/settings/GrowthAdvisoryCard";
import { ReferEarnCard } from "@/components/settings/ReferEarnCard";
import { Lazy } from "@/components/Lazy";

export default function Settings() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  useEffect(() => {
    const target = { "#subscription": ["subscription", "subscription-intl"], "#campaign-agreement": ["campaign-agreement"], "#audit-log": ["audit-log"] }[window.location.hash];
    if (!target) return;
    let tries = 0, hits = 0;
    const iv = setInterval(() => {
      const el = target.map(id => document.getElementById(id)).find(Boolean);
      if (el) { el.scrollIntoView({ behavior: hits ? "auto" : "smooth", block: "start" }); hits += 1; }
      if (hits >= 3 || ++tries > 50) clearInterval(iv);
    }, 400);
    return () => clearInterval(iv);
  }, []);
  const eager = !!window.location.hash;
  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" data-testid="settings-page">
      <div className="max-w-[1600px]">
        <h1 className="font-playfair text-3xl sm:text-4xl text-slate-900">{resto ? "Restaurant Settings" : "Salon Settings"}</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how billing, tax and your business identity behave on invoices.</p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 items-start" data-testid="settings-columns">
          <div className="min-w-0" data-testid="settings-col-left">
            <ProfileCompletenessCard />
            <QrPosterCard />
            <Lazy eager={eager}><VisitingCardCard /></Lazy>
            <Lazy eager={eager}><TableQrPostersCard /></Lazy>
            <Lazy eager={eager}><div className="mt-6"><BranchesSection /></div></Lazy>
            <Lazy eager={eager}><DevicesCard /></Lazy>
            <Lazy eager={eager}><BrandingCard /></Lazy>
            <Lazy eager={eager}><GalleryCard /></Lazy>
            <Lazy eager={eager}><TaxCard /></Lazy>
            <Lazy eager={eager}><InternationalCard /></Lazy>
            <Lazy eager={eager}><SecurityPinCard /></Lazy>
            <Lazy eager={eager}><AuditLogCard /></Lazy>
            <Lazy eager={eager}><UpdatedBillsCard /></Lazy>
            <Lazy eager={eager}><LoyaltyStampsCard /></Lazy>
            <Lazy eager={eager}><CampaignAgreementCard /></Lazy>
            <Lazy eager={eager}><RewardsQrCard /></Lazy>
            <Lazy eager={eager}><SmsPacksCard /></Lazy>
            <Lazy eager={eager}><div className="mt-6"><VendorsCard /></div></Lazy>
            <Lazy eager={eager}><LoyaltyCard /></Lazy>
            <Lazy eager={eager}><ColorTryOnCard /></Lazy>
            <Lazy eager={eager}><InvoicesCard /></Lazy>
            <Lazy eager={eager}><GiftCardsCard /></Lazy>
          </div>
          <div className="min-w-0" data-testid="settings-col-right">
            <ChangePasswordSection />
            <Lazy eager={eager}><ContactHQSection /></Lazy>
            <Lazy eager={eager}><AttendanceFinesCard /></Lazy>
            <Lazy eager={eager}><PreviousStaffCard /></Lazy>
            <Lazy eager={eager}><WhatsAppLinkCard /></Lazy>
            <Lazy eager={eager}><OwnWhatsAppCard /></Lazy>
            <Lazy eager={eager}><PasskeyManagerCard /></Lazy>
            <Lazy eager={eager}><SocialConnectionsCard /></Lazy>
            <Lazy eager={eager}><ReferEarnCard /></Lazy>
            <Lazy eager={eager}><NotifyEmailCard /></Lazy>
            <Lazy eager={eager}><GrowthAdvisoryCard /></Lazy>
            <Lazy eager={eager}><MiracurlProductsCard /></Lazy>
            <Lazy eager={eager}><RateMiracurlCard /></Lazy>
            <Lazy eager={eager}><div className="mt-6"><BirthdayCard /></div></Lazy>
            <Lazy eager={eager}><AffiliateCard /></Lazy>
            <Lazy eager={eager}><StripeSubscriptionCard /></Lazy>
            <Lazy eager={eager}><RazorpayCard /></Lazy>
            <Lazy eager={eager}><PaymentsInvoicesCard /></Lazy>
            <Lazy eager={eager}><AccountProfileCard tenant={tenant} /></Lazy>
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
      </div>
    </div>
  );
}
