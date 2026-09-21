from flask import Flask
from app.config import load_config
from app.firebase_service import init_firebase


def create_app():
    app = Flask(__name__, template_folder="app/templates", static_folder="app/static")
    app.config.update(load_config())
    init_firebase(app)

    from app.routes import main_bp
    app.register_blueprint(main_bp)
    return app
