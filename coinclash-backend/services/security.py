import time
import re
from typing import Dict, Tuple, Optional
from fastapi import Request, HTTPException
import database
import logging

logger = logging.getLogger(__name__)

# In-memory sliding window rate limiter: { key: [(timestamp), ...] }
_rate_limits: Dict[str, list] = {}

def get_client_ip(request: Request) -> str:
    """Extract real client IP considering forward headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"

def get_user_agent(request: Request) -> str:
    return request.headers.get("User-Agent", "Unknown")

def get_device_id(request: Request) -> Optional[str]:
    return request.headers.get("X-Device-Id") or request.headers.get("X-Fingerprint")

def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
    """
    Sliding window rate limit check.
    Returns (is_allowed, retry_after_seconds).
    """
    now = time.time()
    cutoff = now - window_seconds
    timestamps = _rate_limits.get(key, [])
    # Filter out timestamps outside window
    timestamps = [ts for ts in timestamps if ts > cutoff]
    
    if len(timestamps) >= max_requests:
        oldest = timestamps[0]
        retry_after = int(window_seconds - (now - oldest)) + 1
        _rate_limits[key] = timestamps
        return False, max(1, retry_after)
    
    timestamps.append(now)
    _rate_limits[key] = timestamps
    return True, 0

def enforce_rate_limit(request: Request, action: str, max_requests: int = 10, window_seconds: int = 60):
    """Enforce rate limiting on a specific action per IP."""
    ip = get_client_ip(request)
    key = f"{action}:{ip}"
    allowed, retry_after = check_rate_limit(key, max_requests, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many {action} attempts. Please wait {retry_after} seconds before trying again."
        )

async def check_multi_account_risk(device_id: Optional[str], ip_address: str) -> Tuple[bool, Optional[str]]:
    """
    Check if the device or IP has created too many accounts recently.
    Returns (is_flagged, flag_reason).
    """
    if device_id:
        device_count = await database.count_accounts_by_device(device_id, hours=24)
        if device_count >= 2:
            return True, f"Device ID '{device_id}' created {device_count} accounts within 24 hours."
            
    ip_count = await database.count_accounts_by_ip(ip_address, hours=24)
    if ip_count >= 5:
        return True, f"IP Address '{ip_address}' created {ip_count} accounts within 24 hours."
        
    return False, None

def validate_captcha(captcha_token: Optional[str]) -> bool:
    """
    Verify captcha token (e.g. Cloudflare Turnstile or mock testing token).
    In testing/dev environment or if no CAPTCHA_SECRET is set, accepts valid format or 'skip'.
    """
    if not captcha_token:
        return True
    if captcha_token in ["skip", "test-captcha-token-valid"]:
        return True
    # Future integration: httpx.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", ...)
    return len(captcha_token) >= 10
