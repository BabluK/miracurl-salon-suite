import { Calendar, MessageSquare, Receipt, Users, Star, Package, BarChart3, Sparkles, QrCode, ChefHat, CalendarCheck, Bell } from "lucide-react";

export const slugOf = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// [Icon, title, blurb, mock kind, icon tone, bullets]
export const SALON_TILES = (us) => [
  [Calendar, "Online Booking 24/7", "Clients self-book in 5 taps — stylist-level slots, zero double-booking.", "phone", "bg-rose-100 text-rose-500",
    ["Your own /book/your-salon page with services, prices and stylists", "Live slot availability per stylist — no double-booking, ever", "Deposits, rescheduling and cancellations handled automatically"]],
  [MessageSquare, us ? "Email & WhatsApp Reminders" : "WhatsApp Confirmations", "Confirmations, reminders & review requests on autopilot.", "wa", "bg-emerald-100 text-emerald-600",
    ["Instant confirmation the moment a booking lands", "Reminder 24h and 2h before — cuts no-shows sharply", "Post-visit thank-you with a one-tap review link"]],
  [Receipt, "POS Billing & CRM", us ? "Card or cash checkout, local sales tax, tips, full visit history." : "Multi-tab billing, GST invoices, discounts, full visit history.", "pos", "bg-violet-100 text-violet-600",
    [us ? "Card, cash or split payments with local sales tax" : "GST-ready invoices, UPI/cash/card, thermal receipts", "Gift cards, memberships and packages at checkout", "Every visit, product and preference saved to the client profile"]],
  [Users, "Staff, Payroll & Attendance", us ? "Clock-in, commissions, tips and downloadable pay stubs." : "Check-in/out, commissions, salary slips & leave.", "staff", "bg-orange-100 text-orange-500",
    ["Selfie/PIN check-in and check-out with late alerts", "Per-service commission rules and tip tracking", us ? "Monthly pay stubs generated in one click" : "Monthly salary slips and leave balance in one click"]],
  [Star, us ? "Reviews → $ Credits" : "Reviews → ₹ Credits", us ? "4★+ reviews earn a $5 credit — lifts your Google rating." : "4★+ reviews earn ₹50 credit — lifts your Google rating.", "review", "bg-amber-100 text-amber-500",
    ["Review request goes out right after billing", us ? "4★+ reviews reward the client with a $5 wallet credit" : "4★+ reviews reward the client with ₹50 wallet credit", "Mira drafts polite replies to every public review"]],
  [Package, "Inventory & Vendors", "Low-stock alerts with one-click vendor restock emails.", "inventory", "bg-sky-100 text-sky-600",
    ["Stock auto-deducts when a product or service is billed", "Reorder-level alerts in Mira's morning briefing", "One-click restock email or WhatsApp to your vendor"]],
  [BarChart3, "Reports & Commission", "Daily & monthly revenue, per-stylist performance emailed weekly.", "chart", "bg-pink-100 text-pink-500",
    ["Daily close report on WhatsApp/email", "Revenue by service, stylist, product and payment mode", "Weekly performance digest for every stylist"]],
  [Sparkles, "Mira AI Receptionist", "Answers calls & chats 24/7 and books appointments for you.", "mira", "bg-violet-100 text-violet-500",
    ["Chats with clients on your booking page and WhatsApp", "Books, reschedules and answers price questions instantly", "Writes offers, festival posts and review replies for you"]],
];

export const RESTO_TILES = [
  [QrCode, "QR Table Ordering", "Diners scan, browse and order straight to the kitchen — no app, no waiter needed.", "qr", "bg-orange-100 text-orange-500",
    ["Printable QR per table — opens your live menu instantly", "Photos, veg/non-veg filters, add-ons and notes", "Orders land in the kitchen with a chime, no waiter round-trips"]],
  [ChefHat, "Live Kitchen Tickets", "Every order lands with a chime; Live Tables shows each table's running total.", "kot", "bg-amber-100 text-amber-600",
    ["KOT screen for the kitchen with Received → Cooking → Served", "Live Tables board shows every table's running bill", "Prep-time alerts when a ticket runs late"]],
  [Receipt, "Table Billing", "All of a table's orders merge into one bill — one tap to close and reset.", "bill", "bg-emerald-100 text-emerald-600",
    ["Multiple rounds merge into a single bill automatically", "Split by seat, apply discounts, add service charge", "UPI/card/cash — table resets the moment it's paid"]],
  [CalendarCheck, "Reservations", "Guests reserve online with party size and seating choice, pre-pick dishes.", "reserve", "bg-rose-100 text-rose-500",
    ["Online reservations with party size and seating preference", "Pre-order dishes so the kitchen is ready on arrival", "WhatsApp confirmation and reminder for every booking"]],
  [Bell, "Waiter Call & Live Status", "'Call waiter' / 'Water please' plus Order received → Cooking → Served on their phone.", "waiter", "bg-sky-100 text-sky-600",
    ["One-tap 'Call waiter' and 'Water please' from the table", "Guests see their order status live on their phone", "Staff get the ping on their own device — no shouting across the floor"]],
  [Sparkles, "Mira — AI Menu Studio", "AI paints appetizing dish photos and writes menu descriptions in one batch.", "menu", "bg-violet-100 text-violet-500",
    ["Generate studio-quality dish photos from the dish name", "Appetizing descriptions written in your tone", "Festival specials and combo offers drafted on request"]],
];
