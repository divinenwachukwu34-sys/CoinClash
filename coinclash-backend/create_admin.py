"""
CoinClash — Dedicated Admin Account Setup Tool

Creates a dedicated, authenticated administrator/owner account.
Uses standard bcrypt password hashing and marks role='admin', is_admin=TRUE.
Never logs or commits plaintext passwords.

Safety Invariants:
1. Primary identity is email.
2. If the requested email already exists, STOP and refuse. Normal player accounts
   are NEVER converted or modified.
3. If the requested username already exists, STOP with a collision error.
   Never mutate an existing user on username collision.
4. If neither exists, creates a fresh dedicated admin account.
5. Password policy strictly matches standard signup policy:
   - Minimum 8 characters
   - At least one uppercase letter (A-Z)
   - At least one digit (0-9)
   - At least one special character

Usage:
    # Interactive mode (preferred — prompts via secure getpass):
    python create_admin.py

    # Command line argument mode (prompts for password):
    python create_admin.py --email admin@example.com --username superadmin
"""

import os
import sys
import argparse
import getpass
import re
import asyncio
import asyncpg
import bcrypt
from typing import Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/coinclash')


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validate password against CoinClash password security policy."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter (A–Z)."
    if not re.search(r'[0-9]', password):
        return False, "Password must contain at least one number (0–9)."
    if not re.search(r'[^a-zA-Z0-9]', password):
        return False, "Password must contain at least one special character (!@#$%^&*)."
    return True, ""


async def create_dedicated_admin(
    email: str,
    username: str,
    password: str,
    conn=None
) -> dict:
    """
    Safely creates a new dedicated admin account.
    Fails closed if the email or username is already registered.
    Never alters existing player accounts.
    """
    clean_email = email.strip().lower()
    clean_username = username.strip()

    if not clean_email or "@" not in clean_email:
        raise ValueError("Invalid email address format.")
    if not clean_username or len(clean_username) < 3:
        raise ValueError("Username must be at least 3 characters long.")
    if len(clean_username) > 20:
        raise ValueError("Username must be 20 characters or less.")
    if not re.match(r'^[a-zA-Z0-9_]+$', clean_username):
        raise ValueError("Username can only contain letters, numbers, and underscores.")

    valid_pwd, pwd_err = validate_password_strength(password)
    if not valid_pwd:
        raise ValueError(pwd_err)

    close_conn = False
    if conn is None:
        conn = await asyncpg.connect(DB_URL)
        close_conn = True

    try:
        # Ensure role and is_admin columns exist
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'user'")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")

        # 1. Primary check: Email uniqueness
        existing_email = await conn.fetchrow(
            "SELECT id, email, username, role, is_admin FROM users WHERE LOWER(email) = $1",
            clean_email
        )
        if existing_email:
            raise ValueError(
                f"The email '{clean_email}' is already registered (account ID={existing_email['id']}). "
                "Existing player accounts cannot be converted to admin. "
                "Please specify a separate dedicated admin email address."
            )

        # 2. Secondary check: Username uniqueness
        existing_username = await conn.fetchrow(
            "SELECT id, email, username FROM users WHERE LOWER(username) = $1",
            clean_username.lower()
        )
        if existing_username:
            raise ValueError(
                f"The username '{clean_username}' is already taken by account ID={existing_username['id']}. "
                "Please choose a different username for the admin account."
            )

        # 3. Hash password with bcrypt
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # 4. Insert dedicated admin account
        row = await conn.fetchrow(
            """
            INSERT INTO users (
                email, username, password_hash, role, is_admin, is_verified, status, coin_balance
            ) VALUES ($1, $2, $3, 'admin', TRUE, TRUE, 'active', 0)
            RETURNING id, email, username, role, is_admin, is_verified, status, created_at
            """,
            clean_email, clean_username, hashed
        )
        return dict(row)
    finally:
        if close_conn:
            await conn.close()


def main():
    parser = argparse.ArgumentParser(description="CoinClash Dedicated Admin Account Setup")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--username", help="Admin username")
    parser.add_argument("--password", help="Admin password (optional; if omitted, secure prompt will be used)")

    args = parser.parse_args()

    email = args.email or os.getenv("ADMIN_SETUP_EMAIL")
    username = args.username or os.getenv("ADMIN_SETUP_USERNAME")
    password = args.password or os.getenv("ADMIN_SETUP_PASSWORD")

    print("\n==============================================")
    print(" CoinClash — Dedicated Admin Account Setup")
    print("==============================================\n")

    if not email:
        email = input("Enter Dedicated Admin Email: ").strip()
    if not username:
        username = input("Enter Dedicated Admin Username: ").strip()
    if not password:
        password = getpass.getpass("Enter Admin Password (min 8 chars, 1 uppercase, 1 digit, 1 special): ")
        password_confirm = getpass.getpass("Confirm Admin Password: ")
        if password != password_confirm:
            print("\n[ERROR] Passwords do not match.")
            sys.exit(1)

    try:
        res = asyncio.run(create_dedicated_admin(email, username, password))
        print("\n[SUCCESS] Dedicated admin account created successfully!")
        print(f"  - Account ID : {res['id']}")
        print(f"  - Email      : {res['email']}")
        print(f"  - Username   : {res['username']}")
        print(f"  - Role       : {res['role']}")
        print(f"  - Is Admin   : {res['is_admin']}")
        print("\nYou can now sign in to the CoinClash Admin Dashboard using these credentials.")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
