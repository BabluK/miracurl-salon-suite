import LegalLayout, { LegalSection as S } from "@/components/LegalLayout";

export default function Terms() {
  return (
    <LegalLayout testId="terms-page" label="LEGAL" title="Terms of Service"
                 subtitle="Last updated: June 2026 · These terms govern your use of Miracurl Salon Suite."
                 crossLabel="Privacy Policy" crossTo="/privacy-policy">
      <S n="1" title="Who we are & acceptance of these terms">
        <p>Miracurl Salon Suite ("Miracurl", "we", "us") is a cloud-based salon and spa management platform that helps businesses manage appointments, customers, staff, billing, inventory, marketing and related operations. By creating an account, accessing our website, or using any part of the platform, you agree to be bound by these Terms of Service. If you are using Miracurl on behalf of a salon or company, you confirm you have the authority to bind that business to these terms.</p>
        <p>If you do not agree with any part of these terms, please do not use the platform.</p>
      </S>

      <S n="2" title="Your account & eligibility">
        <p>You must be at least 18 years old to open an account. You are responsible for keeping your login credentials, Owner PIN and staff access codes confidential, and for all activity that occurs under your account. Notify us immediately at support@miracurl-suite.com if you suspect unauthorised access.</p>
        <p>You agree to provide accurate business information during signup and to keep it up to date. Each subscription is licensed to a single salon business (tenant); reselling, sharing or sublicensing access to third parties is not permitted without our written consent.</p>
      </S>

      <S n="3" title="Permitted use">
        <p>You may use Miracurl only for lawful business purposes related to running your salon or spa. You agree NOT to:</p>
        <ul>
          <li>Copy, modify, reverse-engineer, scrape or attempt to extract the source code of the platform;</li>
          <li>Use the platform to send spam, unlawful marketing, or messages to people who have not consented to be contacted;</li>
          <li>Upload content that is illegal, infringing, defamatory or harmful;</li>
          <li>Interfere with the security, availability or performance of the service, or attempt to access another tenant's data;</li>
          <li>Use automated tools to create accounts or abuse free trials.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate these rules, with or without prior notice depending on the severity of the violation.</p>
      </S>

      <S n="4" title="Subscriptions, billing & renewals">
        <p>Miracurl is offered on a subscription basis with plans described on our pricing page. Payments are processed securely through our payment partner (Razorpay); we do not store your full card or banking details on our servers.</p>
        <p>Unless stated otherwise, subscriptions renew automatically at the end of each billing cycle. You can cancel renewal at any time from your Billing panel — access continues until the end of the paid period. Prices may change; we will give you reasonable advance notice before any change affects your next billing cycle. Applicable taxes (such as GST) are charged as per law.</p>
      </S>

      <S n="5" title="Refunds & cancellation">
        <p>Subscription fees are non-refundable once a billing period has started. We offer a free trial so you can fully evaluate the platform before paying — please use it to confirm Miracurl fits your business. No refunds or credits are provided for partially used billing periods, unused features, or downgrades.</p>
        <p>In exceptional cases (for example a duplicate payment or a verified billing error on our side), contact support@miracurl-suite.com and we will investigate and correct the error, including a refund where appropriate.</p>
      </S>

      <S n="6" title="Your data & our content">
        <p>You own the business data you enter into Miracurl — your customer records, appointments, invoices and reports ("Customer Data"). You grant us a limited licence to host, process and display that data solely to provide the service to you.</p>
        <p>Everything else — the software, design, logos, AI tools, templates and documentation — belongs to Miracurl or its licensors and is protected by intellectual property law. Content generated using our AI studios (posters, videos, captions) may be used freely for your own salon's marketing.</p>
      </S>

      <S n="7" title="Messaging, AI & third-party services">
        <p>Some features rely on third-party services — for example payment processing, email delivery, WhatsApp links, maps and AI model providers. Your use of those features is also subject to the respective third party's terms. AI-generated content (captions, emails, videos, business insights) is provided as a starting point; you are responsible for reviewing it before publishing or sending it to customers.</p>
        <p>When you use Miracurl to contact your customers (reminders, offers, review requests), you confirm you have obtained any consent required under applicable law.</p>
      </S>

      <S n="8" title="Service availability & support">
        <p>We work hard to keep Miracurl available around the clock, but no online service can guarantee uninterrupted uptime. We may perform maintenance, updates or improvements that temporarily affect availability, and we will try to minimise disruption. Support is available via the in-app assistant and email.</p>
      </S>

      <S n="9" title="Disclaimer & limitation of liability">
        <p>The platform is provided "as is" and "as available". To the maximum extent permitted by law, we disclaim implied warranties of merchantability, fitness for a particular purpose and non-infringement. We are not liable for indirect, incidental or consequential losses (including lost profits, lost bookings or loss of goodwill).</p>
        <p>Our total aggregate liability arising out of or related to the service is limited to the subscription fees you paid to us in the three (3) months preceding the claim.</p>
      </S>

      <S n="10" title="Termination">
        <p>You may stop using Miracurl and cancel your subscription at any time. We may suspend or terminate your access if you materially breach these terms, fail to pay fees, or use the platform in a way that risks harm to us, other tenants or third parties. After termination, we retain Customer Data for a limited grace period (typically 30 days) so you can export it, after which it may be deleted.</p>
      </S>

      <S n="11" title="Changes to these terms">
        <p>We may update these terms from time to time to reflect new features, legal requirements or business changes. Material changes will be notified in-app or by email. Continuing to use the platform after changes take effect means you accept the updated terms.</p>
      </S>

      <S n="12" title="Governing law & contact">
        <p>These terms are governed by the laws of India, and the courts of Bangalore, Karnataka shall have exclusive jurisdiction over any dispute. Questions about these terms? Write to us at <a href="mailto:support@miracurl-suite.com">support@miracurl-suite.com</a>.</p>
      </S>
    </LegalLayout>
  );
}
