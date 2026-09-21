import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def load_config():
    return {
        "DEVICE_ID": os.getenv("DEVICE_ID", "shedtrace-01"),
        "STATUS_THRESHOLD_MG": int(os.getenv("STATUS_THRESHOLD_MG", "500")),
        "FIREBASE_DATABASE_URL": os.getenv("FIREBASE_DATABASE_URL", ""),
        "FIREBASE_SERVICE_ACCOUNT_PATH": os.getenv(
            "FIREBASE_SERVICE_ACCOUNT_PATH",
            str(BASE_DIR / "serviceAccountKey.json"),
        ),
    }
