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

async def _read_csv_upload(file: UploadFile) -> str:
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "Only CSV files are supported. Export first to get the exact template.")
    raw = await file.read()
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(413, "CSV too large — please keep imports under 5MB.")
    return raw.decode("utf-8-sig", errors="ignore")

