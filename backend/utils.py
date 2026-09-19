"""CSV import/export helpers shared across route modules."""
from fastapi import HTTPException, UploadFile

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5MB import cap

def _csv_cell(v):
    """Neutralize CSV/formula injection: prefix risky leading chars with a quote."""
    s = "" if v is None else str(v)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s

def _csv_row(w, values):
    w.writerow([_csv_cell(v) for v in values])


_PAY_LABELS = {"cash": "Cash", "card": "Card", "upi": "GPay", "wallet": "Phone Pay"}


def _pay_label(mode) -> str:
    return _PAY_LABELS.get(str(mode or "").lower(), str(mode or "").upper())

async def _read_csv_upload(file: UploadFile) -> str:
    """Accepts .csv or Excel (.xlsx/.xls*) — Excel is converted to CSV text (first sheet)."""
    fname = (file.filename or "").lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx") or fname.endswith(".xlsm")):
        raise HTTPException(400, "Upload a CSV or Excel (.xlsx) file. Export first to get the exact template.")
    raw = await file.read()
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(413, "File too large — please keep imports under 5MB.")
    if fname.endswith(".csv"):
        return raw.decode("utf-8-sig", errors="ignore")
    import io as _io, csv as _csv
    from openpyxl import load_workbook
    wb = load_workbook(_io.BytesIO(raw), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    out = _io.StringIO()
    w = _csv.writer(out)
    for row in ws.iter_rows(values_only=True):
        if row is None or all(v in (None, "") for v in row):
            continue
        w.writerow(["" if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)) for v in row])
    return out.getvalue()


# Header aliases so real-world exports (Excel from other salon software) import without renaming columns
_CUSTOMER_HEADER_ALIASES = {
    "name": ("name", "customer name", "client name", "full name", "customer", "client", "guest name"),
    "first_name": ("first name", "firstname", "first_name", "given name"),
    "last_name": ("last name", "lastname", "last_name", "surname"),
    "phone": ("phone", "mobile", "mobile number", "phone number", "contact", "contact number", "whatsapp", "mobile no", "phone no", "cell"),
    "email": ("email", "e-mail", "email address", "mail"),
    "gender": ("gender", "sex"),
    "dob": ("dob", "date of birth", "birthday", "birth date"),
    "address": ("address", "location", "city", "area", "store location"),
    "notes": ("notes", "note", "remarks", "comments"),
}


def normalize_customer_row(raw: dict) -> dict:
    """Map arbitrary headers onto the canonical import columns; joins First/Last Name into name."""
    row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items() if k is not None}
    out = {}
    for canon, aliases in _CUSTOMER_HEADER_ALIASES.items():
        for a in aliases:
            if row.get(a):
                out[canon] = row[a]
                break
    if not out.get("name"):
        out["name"] = " ".join(x for x in (out.get("first_name"), out.get("last_name")) if x).strip()
    out.pop("first_name", None); out.pop("last_name", None)
    return out

