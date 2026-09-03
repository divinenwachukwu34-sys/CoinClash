import os
import httpx
import logging

PAYSTACK_SECRET = os.getenv('PAYSTACK_SECRET_KEY')
BASE_URL = "https://api.paystack.co"

logger = logging.getLogger(__name__)

class PaystackClient:
    @staticmethod
    def get_headers():
        return {
            "Authorization": f"Bearer {PAYSTACK_SECRET}",
            "Content-Type": "application/json"
        }

    @staticmethod
    async def create_customer(email: str, first_name: str = "", last_name: str = "", phone: str = "") -> dict:
        if not PAYSTACK_SECRET:
            # Return mock data for development if no key
            return {"customer_code": f"CUS_{email.split('@')[0]}", "id": 12345}
            
        async with httpx.AsyncClient() as client:
            payload = {"email": email}
            if first_name: payload["first_name"] = first_name
            if last_name: payload["last_name"] = last_name
            if phone: payload["phone"] = phone
                
            response = await client.post(
                f"{BASE_URL}/customer",
                headers=PaystackClient.get_headers(),
                json=payload
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            logger.error(f"Failed to create Paystack customer: {data}")
            raise Exception(f"Paystack error: {data.get('message', 'Unknown error')}")

    @staticmethod
    async def get_customer(email_or_code: str) -> dict | None:
        if not PAYSTACK_SECRET:
            return {"customer_code": f"CUS_{email_or_code.split('@')[0]}", "id": 12345}
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/customer/{email_or_code}",
                headers=PaystackClient.get_headers()
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            return None

    @staticmethod
    async def update_customer(customer_code: str, first_name: str = "", last_name: str = "", phone: str = "") -> dict | None:
        if not PAYSTACK_SECRET:
            return {"customer_code": customer_code}
            
        async with httpx.AsyncClient() as client:
            payload = {}
            if first_name: payload["first_name"] = first_name
            if last_name: payload["last_name"] = last_name
            if phone: payload["phone"] = phone
            
            response = await client.put(
                f"{BASE_URL}/customer/{customer_code}",
                headers=PaystackClient.get_headers(),
                json=payload
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            return None

    @staticmethod
    async def get_or_create_customer(email: str, first_name: str = "", last_name: str = "", phone: str = "") -> dict:
        if not PAYSTACK_SECRET:
            return {"customer_code": f"CUS_{email.split('@')[0]}", "id": 12345}

        # Try to fetch existing customer first
        existing = await PaystackClient.get_customer(email)
        if existing:
            customer_code = existing["customer_code"]
            if phone or first_name or last_name:
                await PaystackClient.update_customer(customer_code, first_name, last_name, phone)
            return existing

        # If not found, create new customer
        try:
            return await PaystackClient.create_customer(email, first_name, last_name, phone)
        except Exception as e:
            existing_after_error = await PaystackClient.get_customer(email)
            if existing_after_error:
                return existing_after_error
            raise e

    @staticmethod
    async def create_dedicated_account(customer_code: str, preferred_bank: str = "wema-bank") -> dict:
        if not PAYSTACK_SECRET:
            return {
                "bank": {"name": "Mock Bank"},
                "account_number": "0123456789",
                "account_name": "JOHN DOE"
            }
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/dedicated_account",
                headers=PaystackClient.get_headers(),
                json={
                    "customer": customer_code,
                    "preferred_bank": preferred_bank
                }
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            logger.error(f"Failed to create DVA: {data}")
            raise Exception(f"Paystack error: {data.get('message', 'Unknown error')}")

    @staticmethod
    async def get_banks() -> list:
        if not PAYSTACK_SECRET:
            return [
                {"name": "Access Bank", "code": "044"},
                {"name": "Guaranty Trust Bank", "code": "058"},
                {"name": "United Bank for Africa", "code": "033"},
                {"name": "Zenith Bank", "code": "057"},
                {"name": "First Bank of Nigeria", "code": "011"}
            ]
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/bank?currency=NGN",
                headers=PaystackClient.get_headers()
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            return []

    @staticmethod
    async def resolve_account(account_number: str, bank_code: str) -> dict:
        if not PAYSTACK_SECRET:
            if len(account_number) == 10:
                return {"account_name": "JOHN DOE", "account_number": account_number}
            raise Exception("Invalid account number length")
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/bank/resolve?account_number={account_number}&bank_code={bank_code}",
                headers=PaystackClient.get_headers()
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            raise Exception(f"Paystack error: {data.get('message', 'Could not resolve account')}")

    @staticmethod
    async def create_transfer_recipient(name: str, account_number: str, bank_code: str) -> dict:
        if not PAYSTACK_SECRET:
            return {"recipient_code": f"RCP_mock_{account_number}"}
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/transferrecipient",
                headers=PaystackClient.get_headers(),
                json={
                    "type": "nuban",
                    "name": name,
                    "account_number": account_number,
                    "bank_code": bank_code,
                    "currency": "NGN"
                }
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            raise Exception(f"Paystack error: {data.get('message', 'Could not create recipient')}")

    @staticmethod
    async def initiate_transfer(amount_ngn: float, recipient_code: str, reference: str, reason: str = "CoinClash Withdrawal") -> dict:
        if not PAYSTACK_SECRET:
            return {"status": "success", "message": "Mock transfer queued"}
            
        amount_kobo = int(amount_ngn * 100)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/transfer",
                headers=PaystackClient.get_headers(),
                json={
                    "source": "balance",
                    "amount": amount_kobo,
                    "recipient": recipient_code,
                    "reason": reason,
                    "reference": reference
                }
            )
            data = response.json()
            if data.get("status"):
                return data["data"]
            raise Exception(f"Paystack error: {data.get('message', 'Transfer failed')}")
