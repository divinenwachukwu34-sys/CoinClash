import asyncio, asyncpg, os
from dotenv import load_dotenv
load_dotenv()

async def main():
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)')
    print('[OK] phone column added to users table')
    await conn.close()

asyncio.run(main())
