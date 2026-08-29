"""Default data seeded into brand-new tenants (shared by signup & super-admin flows)."""
import uuid
from datetime import datetime, timezone

from database import _raw_db

_SAMPLE_MENU = [
    ("Starters", "Paneer Tikka", 249), ("Starters", "Veg Spring Rolls", 199),
    ("Mains", "Butter Chicken", 349), ("Mains", "Dal Makhani", 279),
    ("Breads & Rice", "Garlic Naan", 69), ("Breads & Rice", "Jeera Rice", 149),
    ("Desserts", "Gulab Jamun", 99), ("Beverages", "Fresh Lime Soda", 89),
]


async def _seed_restaurant_defaults(tenant_id: str) -> None:
    """Restaurant trials start with a sample menu + a Host so table reservations work day one."""
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.services.insert_many([{
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": n, "category": c,
        "price": float(p), "duration_min": 0, "description": "", "image_url": "",
        "trending": False, "active": True, "gender": "unisex"} for c, n, p in _SAMPLE_MENU])
    await _raw_db.staff.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Front Desk / Host",
        "role": "Host", "phone": "", "email": "", "specialties": [], "commission_pct": 0.0,
        "active": True, "image_url": None, "joining_date": now[:10],
        "monthly_base_salary": 0.0, "salary_visible": False,
        "shift_start": "10:00", "shift_end": "23:00", "branch": "", "week_off_day": ""})
