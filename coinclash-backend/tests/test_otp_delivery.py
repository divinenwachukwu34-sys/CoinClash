import sys
import os
import asyncio
from datetime import datetime, timezone, timedelta

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.otp import get_smtp_config, send_otp_email, generate_secure_otp

def test_smtp_config_dynamic_eval():
    os.environ["SMTP_HOST"] = "smtp.customhost.com"
    os.environ["SMTP_PORT"] = "465"
    os.environ["SMTP_USER"] = "testuser@customhost.com"
    os.environ["SMTP_PASS"] = "secretpassword"

    host, port, user, password = get_smtp_config()
    assert host == "smtp.customhost.com"
    assert port == 465
    assert user == "testuser@customhost.com"
    assert password == "secretpassword"
    print("[PASS] test_smtp_config_dynamic_eval")

def test_send_otp_email_missing_credentials_logging():
    os.environ["SMTP_USER"] = ""
    os.environ["SMTP_PASS"] = ""

    result = send_otp_email("user@example.com", "123456", username="TestUser", purpose="signup")
    assert result is False, "send_otp_email should return False when credentials are missing"
    print("[PASS] test_send_otp_email_missing_credentials_logging")

def test_otp_code_generation():
    for _ in range(50):
        code = generate_secure_otp()
        assert len(code) == 6, f"OTP code length must be 6 digits, got {code}"
        assert code.isdigit(), f"OTP code must be numeric, got {code}"
    print("[PASS] test_otp_code_generation")

if __name__ == "__main__":
    test_smtp_config_dynamic_eval()
    test_send_otp_email_missing_credentials_logging()
    test_otp_code_generation()
    print("ALL OTP DELIVERY TESTS PASSED SUCCESSFULLY!")
