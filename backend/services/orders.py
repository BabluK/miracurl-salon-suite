"""Product-order customer emails — shared by public_site routes and Razorpay webhooks."""
import asyncio

from email_service import _send_email


def _order_status_email_html(order: dict, status: str) -> str:
    if status == "paid":
        headline, line = "Payment Received ✦", (
            f"We've received your payment of <b>₹{order.get('total', 0):,.0f}</b>. "
            "Your Miracurl order is confirmed and will be packed & dispatched shortly.")
    else:
        headline, line = "Your Order Is On Its Way 🚚", (
            "Great news — your Miracurl order has been <b>dispatched</b>! "
            f"It's headed to: <b>{order.get('address', '')} — PIN {order.get('pincode', '')}</b>.")
    items = ", ".join(f"{i.get('id')} × {i.get('qty')}" for i in (order.get("items") or []))
    return f"""
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#A61C3C">Miracurl Hair Science — {headline}</h2>
  <p>Hi {order.get('name', '')}, {line}</p>
  <p style="font-size:13px;background:#FDEDF0;border-radius:10px;padding:12px 16px">
    <b>Order ID:</b> {order.get('id', '')}<br/><b>Items:</b> {items}<br/><b>Total:</b> ₹{order.get('total', 0):,.0f}</p>
  <p style="font-size:12px;color:#888">Questions? payments@miracurl-suite.com · +91 9180261256</p>
</div>"""


def send_order_status_email(order: dict, status: str) -> None:
    """Fire-and-forget customer email on paid/dispatched transitions."""
    if status not in ("paid", "dispatched") or not order.get("email"):
        return
    subject = "Payment received — Miracurl order ✦" if status == "paid" else "Your Miracurl order is dispatched 🚚"
    asyncio.create_task(_send_email(
        [order["email"]], subject, _order_status_email_html(order, status), from_name="Miracurl Hair Science"))
