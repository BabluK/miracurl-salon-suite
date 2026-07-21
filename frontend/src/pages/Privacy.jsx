import LegalLayout, { LegalSection as S } from "@/components/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout testId="privacy-page" label="LEGAL" title="Privacy Policy"
                 subtitle="Last updated: June 2026 · How Miracurl Salon Suite collects, uses and protects information."
                 cross={[{ label: "Terms of Service", to: "/terms-of-service" }, { label: "Refund Policy", to: "/refund-policy" }]}>
      <S n="1" title="Overview">
        <p>Miracurl Salon Suite ("Miracurl", "we", "us") provides salon management software to businesses. This policy explains what information we collect, why we collect it, and the choices you have. It applies to our websites, web apps, booking pages and related services.</p>
        <p>We act in two roles: as a <strong>data controller</strong> for information about salon owners and staff who sign up with us, and as a <strong>data processor</strong> for the customer records that salons store inside the platform. Salons remain responsible for the customer data they collect through Miracurl.</p>
      </S>

      <S n="2" title="Information we collect">
        <ul>
          <li><strong>Account information</strong> — name, business name, email, phone number and password (stored in hashed form) when you register.</li>
          <li><strong>Business data</strong> — appointments, customer records, invoices, staff details, inventory and reports that you enter while using the platform.</li>
          <li><strong>Payment information</strong> — handled by our payment partner (Razorpay). We receive transaction status and identifiers, never your full card or bank details.</li>
          <li><strong>Usage & device data</strong> — log data such as IP address, browser type, pages visited and actions taken, used for security and product improvement.</li>
          <li><strong>Content you generate</strong> — images, posters, videos and text produced through our AI studios, stored so you can reuse them.</li>
        </ul>
      </S>

      <S n="3" title="How we use information">
        <ul>
          <li>To provide, operate and improve the platform and its features;</li>
          <li>To process subscription payments and send billing receipts;</li>
          <li>To send service messages — booking confirmations, reminders, security alerts and product updates;</li>
          <li>To provide customer support and respond to your requests;</li>
          <li>To keep the platform secure, prevent fraud and enforce our Terms of Service;</li>
          <li>To comply with legal obligations such as tax and accounting rules.</li>
        </ul>
        <p>We do not sell your personal information or your customers' information to anyone.</p>
      </S>

      <S n="4" title="Cookies & similar technologies">
        <p>We use a small number of cookies and browser storage to keep you signed in, remember preferences and understand how the product is used so we can improve it. Essential cookies are required for the platform to work. You can control non-essential cookies through your browser settings; disabling essential cookies may prevent login or core features from functioning.</p>
      </S>

      <S n="5" title="When we share information">
        <p>We share data only where necessary to run the service:</p>
        <ul>
          <li><strong>Service providers</strong> — cloud hosting, payment processing, email delivery and AI model providers who process data on our instructions under confidentiality obligations;</li>
          <li><strong>Your salon</strong> — if you are a staff member or customer of a salon using Miracurl, your data is visible to that salon as the business owner of the record;</li>
          <li><strong>Legal requirements</strong> — where required by law, court order or to protect the rights and safety of our users;</li>
          <li><strong>Business transfers</strong> — if Miracurl is involved in a merger or acquisition, data may transfer as part of that transaction with continued protection under this policy.</li>
        </ul>
      </S>

      <S n="6" title="Data retention">
        <p>We keep account and business data for as long as your subscription is active. After account closure, data is retained for a limited grace period (typically 30 days) so you can export it, then deleted or anonymised, except where the law requires longer retention (for example invoices for tax purposes).</p>
      </S>

      <S n="7" title="Security">
        <p>We protect data using industry-standard measures including encryption in transit (HTTPS/TLS), hashed passwords, role-based access controls, tenant isolation between salons, and Owner PIN protection for sensitive actions. No system is perfectly secure, so we also encourage you to use strong passwords and restrict staff access to what each role needs.</p>
      </S>

      <S n="8" title="Your rights">
        <p>Depending on your location (including under India's DPDP Act and the EU GDPR where applicable), you may have the right to:</p>
        <ul>
          <li>Access a copy of the personal data we hold about you;</li>
          <li>Correct inaccurate or incomplete data;</li>
          <li>Request deletion of your data ("right to be forgotten");</li>
          <li>Export your data in a portable format;</li>
          <li>Object to or restrict certain processing, and withdraw consent where processing is based on consent.</li>
        </ul>
        <p>To exercise any of these rights, email <a href="mailto:privacy@miracurl-suite.com">privacy@miracurl-suite.com</a>. If you are a salon's customer, please contact the salon directly first — they control your booking records.</p>
      </S>

      <S n="9" title="Marketing communications">
        <p>We may send you product news and offers about Miracurl if you have opted in. Every marketing email includes an unsubscribe link. Messages that salons send to their own customers through Miracurl (reminders, offers, review requests) are the responsibility of that salon, which must have the required consent.</p>
      </S>

      <S n="10" title="Children">
        <p>Miracurl is a business tool and is not directed at children. We do not knowingly collect personal data from anyone under 18 as an account holder. If you believe a minor has created an account, contact us and we will remove it.</p>
      </S>

      <S n="11" title="Changes to this policy">
        <p>We may update this policy as our product and legal obligations evolve. Material changes will be announced in-app or by email before they take effect. The "Last updated" date at the top reflects the latest revision.</p>
      </S>

      <S n="12" title="Contact us">
        <p>For any privacy question, request or complaint, contact our privacy team at <a href="mailto:privacy@miracurl-suite.com">privacy@miracurl-suite.com</a>. Miracurl Salon Suite, Bangalore, Karnataka, India.</p>
      </S>
    </LegalLayout>
  );
}
