import LegalLayout, { LegalSection as S } from "@/components/LegalLayout";

export default function Refund() {
  return (
    <LegalLayout testId="refund-page" label="LEGAL" title="Refund Policy"
                 subtitle="Last updated: July 21, 2026 · Refunds, cancellations and billing disputes for Miracurl Suite."
                 cross={[{ label: "Terms of Service", to: "/terms-of-service" }, { label: "Privacy Policy", to: "/privacy-policy" }]}>
      <S n="1" title="Overview">
        <p>Miracurl Suite is a subscription-based software platform that provides salon management solutions, including appointment booking, CRM, POS, staff management, and AI-powered services.</p>
        <p>By purchasing a subscription, customers agree to this Refund Policy.</p>
      </S>

      <S n="2" title="Free trial (if applicable)">
        <p>If Miracurl Suite offers a free trial period, customers may evaluate the platform before subscribing. No charges will be applied during the trial period unless explicitly stated.</p>
      </S>

      <S n="3" title="Subscription fees">
        <p>Subscription fees are charged in advance on a monthly or yearly basis depending on the selected plan.</p>
      </S>

      <S n="4" title="India customers">
        <p><strong>Eligible refunds</strong> — Refund requests may be considered if:</p>
        <ul>
          <li>Duplicate payment has been made;</li>
          <li>Incorrect amount has been charged due to a technical issue;</li>
          <li>Service could not be activated due to an issue caused solely by Miracurl Suite.</li>
        </ul>
        <p><strong>Non-refundable situations</strong> — Refunds will not be provided for:</p>
        <ul>
          <li>Change of mind after subscription activation;</li>
          <li>Partial usage of subscription period;</li>
          <li>Failure to use the software;</li>
          <li>User configuration errors;</li>
          <li>Violation of Terms of Service.</li>
        </ul>
        <p>Approved refunds will be processed within <strong>7–10 business days</strong>.</p>
      </S>

      <S n="5" title="International customers (outside India)">
        <p><strong>Eligible refunds</strong> — Refunds may be granted in cases of:</p>
        <ul>
          <li>Duplicate transactions;</li>
          <li>Technical failure preventing access to the subscribed services;</li>
          <li>Billing errors caused by Miracurl Suite.</li>
        </ul>
        <p><strong>Non-refundable cases</strong>:</p>
        <ul>
          <li>Subscription cancellation after service activation;</li>
          <li>Dissatisfaction due to unmet expectations not related to platform defects;</li>
          <li>Failure to use services after purchase.</li>
        </ul>
        <p>Approved refunds will generally be processed within <strong>10–15 business days</strong>, depending on the customer's bank and payment provider.</p>
        <p>Any foreign exchange conversion charges, intermediary bank fees, taxes, or payment processing charges imposed by financial institutions are non-refundable.</p>
      </S>

      <S n="6" title="Cancellation policy">
        <p>Customers may cancel their subscription at any time. Cancellation will stop future renewals, and access to the platform will remain active until the end of the current billing cycle.</p>
        <p>No prorated refunds shall be provided for unused subscription periods unless otherwise required by applicable law.</p>
      </S>

      <S n="7" title="Chargebacks">
        <p>Customers are encouraged to contact Miracurl Suite before initiating any payment dispute or chargeback. Fraudulent or abusive chargebacks may result in suspension or termination of services.</p>
      </S>

      <S n="8" title="Contact information">
        <p>For refund-related requests, please contact:</p>
        <p><strong>Miracurl Suite</strong><br />
          Refunds &amp; billing: <a href="mailto:billing@miracurl-suite.com">billing@miracurl-suite.com</a><br />
          Payments: <a href="mailto:payments@miracurl-suite.com">payments@miracurl-suite.com</a><br />
          Support: <a href="mailto:support@miracurl-suite.com">support@miracurl-suite.com</a><br />
          Website: <a href="https://miracurl-suite.com">https://miracurl-suite.com</a><br />
          Bangalore, Karnataka, India</p>
      </S>
    </LegalLayout>
  );
}
