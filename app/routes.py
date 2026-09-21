from flask import Blueprint, jsonify, render_template, request

from app.firebase_service import (
    clean_filter,
    create_simulated_wash,
    firebase_error_message,
    get_history,
    get_resets,
    get_status,
    get_washes,
    is_firebase_ready,
)

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.route("/api/status")
def api_status():
    if not is_firebase_ready():
        return jsonify({
            "error": firebase_error_message(),
            "device_id": "shedtrace-01",
            "cumulative_mg": 0.0,
            "filter_full": False,
            "last_updated": None,
            "threshold_mg": 500,
        }), 503
    return jsonify(get_status())


@main_bp.route("/api/washes")
def api_washes():
    if not is_firebase_ready():
        return jsonify({"error": firebase_error_message(), "washes": []}), 503
    return jsonify({"washes": get_washes()})


@main_bp.route("/api/resets")
def api_resets():
    if not is_firebase_ready():
        return jsonify({"error": firebase_error_message(), "resets": []}), 503
    return jsonify({"resets": get_resets()})


@main_bp.route("/api/history")
def api_history():
    if not is_firebase_ready():
        return jsonify({"error": firebase_error_message(), "history": []}), 503
    return jsonify({"history": get_history()})


@main_bp.route("/api/simulate-wash", methods=["POST"])
def simulate_wash():
    if not is_firebase_ready():
        return jsonify({"success": False, "error": firebase_error_message()}), 503
    result = create_simulated_wash()
    return jsonify({"success": True, "wash": result})


@main_bp.route("/api/clean-filter", methods=["POST"])
def clean_filter_endpoint():
    if not is_firebase_ready():
        return jsonify({"success": False, "error": firebase_error_message()}), 503
    result = clean_filter()
    return jsonify({"success": True, "reset": result})
