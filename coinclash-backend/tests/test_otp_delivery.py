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
    os.environ["SMTP_USER"] = "bcbdf1001@smtp-brevo.com"
    os.environ["SMTP_PASS"] = "secretpassword"
    os.environ["SMTP_FROM"] = "noreply@coinclash.live"

    host, port, user, password, from_email = get_smtp_config()
    assert host == "smtp.customhost.com"
    assert port == 465
    assert user == "bcbdf1001@smtp-brevo.com", "SMTP_USER must be used for authentication"
    assert password == "secretpassword"
    assert from_email == "noreply@coinclash.live", "SMTP_FROM must be used for email From address"
    print("[PASS] test_smtp_config_dynamic_eval")

def test_smtp_from_default_fallback():
    if "SMTP_FROM" in os.environ:
        del os.environ["SMTP_FROM"]
    os.environ["SMTP_USER"] = "authuser@smtp.com"
    os.environ["SMTP_PASS"] = "secretpassword"

    host, port, user, password, from_email = get_smtp_config()
    assert from_email == "noreply@coinclash.live", "SMTP_FROM must default to noreply@coinclash.live when unconfigured"
    assert user == "authuser@smtp.com"
    print("[PASS] test_smtp_from_default_fallback")

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
    test_smtp_from_default_fallback()
    test_send_otp_email_missing_credentials_logging()
    test_otp_code_generation()
    print("ALL OTP DELIVERY TESTS PASSED SUCCESSFULLY!")
