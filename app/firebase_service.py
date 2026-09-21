import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import firebase_admin
from firebase_admin import credentials, db

from app.config import load_config


_FIREBASE_DB = None
_APP_CONFIG = load_config()
_DEVICE_ID = _APP_CONFIG["DEVICE_ID"]
_STATUS_THRESHOLD_MG = _APP_CONFIG["STATUS_THRESHOLD_MG"]


def is_firebase_ready() -> bool:
    return _FIREBASE_DB is not None


def firebase_error_message() -> str:
    database_url = _APP_CONFIG["FIREBASE_DATABASE_URL"]
    service_account_path = _APP_CONFIG["FIREBASE_SERVICE_ACCOUNT_PATH"]
    if not database_url:
        return "Firebase DATABASE_URL is not configured. Add FIREBASE_DATABASE_URL to your environment or .env file."
    if not os.path.exists(service_account_path):
        return (
            f"Firebase service account file was not found at {service_account_path}. "
            "Place your downloaded Firebase service account JSON there or set FIREBASE_SERVICE_ACCOUNT_PATH."
        )
    return "Firebase is not initialized."


def init_firebase(app: Any) -> bool:
    global _FIREBASE_DB

    if _FIREBASE_DB is not None:
        return True

    database_url = app.config.get("FIREBASE_DATABASE_URL") or os.getenv("FIREBASE_DATABASE_URL")
    service_account_path = app.config.get("FIREBASE_SERVICE_ACCOUNT_PATH") or os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_PATH"
    )

    if not database_url or not service_account_path or not os.path.exists(service_account_path):
        return False

    if not firebase_admin._apps:
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred, {"databaseURL": database_url})

    _FIREBASE_DB = db.reference()
    return True


def _device_path(*parts: str) -> str:
    return "/".join(["devices", _DEVICE_ID, *parts])


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _to_iso(value: Any) -> Optional[str]:
    parsed = _parse_timestamp(value)
    if parsed is None:
        return None
    return parsed.isoformat().replace("+00:00", "Z")


def _status_ref():
    if not is_firebase_ready():
        raise RuntimeError(firebase_error_message())
    return _FIREBASE_DB.child(_device_path("status"))


def _washes_ref():
    if not is_firebase_ready():
        raise RuntimeError(firebase_error_message())
    return _FIREBASE_DB.child(_device_path("washes"))


def _resets_ref():
    if not is_firebase_ready():
        raise RuntimeError(firebase_error_message())
    return _FIREBASE_DB.child(_device_path("resets"))


def get_status() -> Dict[str, Any]:
    data = _status_ref().get() or {}
    cumulative = float(data.get("cumulative_mg", 0) or 0)
    filter_full = bool(data.get("filter_full", False))
    last_updated = data.get("last_updated")
    return {
        "device_id": _DEVICE_ID,
        "cumulative_mg": round(cumulative, 2),
        "filter_full": filter_full,
        "last_updated": last_updated,
        "threshold_mg": _STATUS_THRESHOLD_MG,
    }


def get_washes() -> List[Dict[str, Any]]:
    raw_data = _washes_ref().get() or {}
    washes: List[Dict[str, Any]] = []
    for push_id, wash in raw_data.items():
        if not isinstance(wash, dict):
            continue
        timestamp = wash.get("timestamp") or wash.get("time")
        value = wash.get("estimated_mg")
        try:
            est_mg = float(value) if value is not None else 0.0
        except (TypeError, ValueError):
            est_mg = 0.0
        item = {
            "id": push_id,
            "timestamp": _to_iso(timestamp) or "",
            "estimated_mg": round(est_mg, 2),
            "source": wash.get("source", "hardware"),
        }
        washes.append(item)
    washes.sort(key=lambda item: _parse_timestamp(item["timestamp"]) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return washes


def get_resets() -> List[Dict[str, Any]]:
    raw_data = _resets_ref().get() or {}
    resets: List[Dict[str, Any]] = []
    for push_id, entry in raw_data.items():
        if not isinstance(entry, dict):
            continue
        timestamp = entry.get("timestamp") or entry.get("time")
        item = {
            "id": push_id,
            "timestamp": _to_iso(timestamp) or "",
            "source": entry.get("source", "hardware"),
        }
        resets.append(item)
    resets.sort(key=lambda item: _parse_timestamp(item["timestamp"]) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return resets


def get_history() -> List[Dict[str, Any]]:
    washes = get_washes()
    resets = get_resets()
    items: List[Dict[str, Any]] = []
    for wash in washes:
        items.append({
            "type": "wash",
            "id": wash["id"],
            "timestamp": wash["timestamp"],
            "title": "Wash cycle",
            "description": f"{wash['estimated_mg']} mg captured",
            "source": wash.get("source", "hardware"),
            "estimated_mg": wash["estimated_mg"],
        })
    for reset in resets:
        items.append({
            "type": "reset",
            "id": reset["id"],
            "timestamp": reset["timestamp"],
            "title": "Filter reset",
            "description": "Cumulative count cleared to 0",
            "source": reset.get("source", "hardware"),
        })
    items.sort(key=lambda item: _parse_timestamp(item["timestamp"]) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return items


def create_simulated_wash() -> Dict[str, Any]:
    import random

    status = get_status()
    current_total = float(status["cumulative_mg"]) if status.get("cumulative_mg") is not None else 0.0
    estimated_mg = round(random.uniform(40.0, 170.0), 2)
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    wash_record = {"timestamp": timestamp, "estimated_mg": estimated_mg, "source": "simulated"}
    _washes_ref().push(wash_record)

    next_total = current_total + estimated_mg
    _status_ref().set({
        "cumulative_mg": round(next_total, 2),
        "filter_full": next_total >= _STATUS_THRESHOLD_MG,
        "last_updated": timestamp,
    })
    return {"timestamp": timestamp, "estimated_mg": estimated_mg, "source": "simulated"}


def clean_filter() -> Dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _status_ref().set({
        "cumulative_mg": 0.0,
        "filter_full": False,
        "last_updated": timestamp,
    })
    reset_record = {"timestamp": timestamp, "source": "manual"}
    _resets_ref().push(reset_record)
    return {"timestamp": timestamp, "source": "manual"}
