"""Shared Stripe checkout factory used by payments_intl and pay_links (breaks circular import)."""
import os

from fastapi import Request


def _checkout(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url)
    return StripeCheckout(api_key=os.environ["STRIPE_API_KEY"],
                          webhook_url=f"{host_url}api/webhook/stripe")
