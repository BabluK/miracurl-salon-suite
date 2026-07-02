import asyncio
import os
import uuid
import bcrypt
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    admin = await db.users.find_one({'email': 'admin@miracurl.com'})
    if not admin:
        print("Admin not found")
        return
    h = bcrypt.hashpw('Manager@Miracurl123'.encode(), bcrypt.gensalt()).decode()
    res = await db.users.update_one(
        {'email': 'manager@miracurl.com'},
        {'$set': {'name': 'Salon Manager', 'role': 'manager', 'tenant_id': admin['tenant_id'],
                  'status': 'active', 'disabled': False, 'password_hash': h, 'must_change_password': False},
         '$setOnInsert': {'id': str(uuid.uuid4()), 'created_at': datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    print("Manager seeded. upserted:", res.upserted_id, "matched:", res.matched_count)

asyncio.run(main())
