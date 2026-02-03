import os
import firebase_admin
from firebase_admin import credentials, auth


def init_admin():
    """
    Mirrors your server env convention:
    FIREBASE_SERVICE_ACCOUNT_JSON can be:
      - a file path (preferred)
      - raw JSON string
    """
    sa_value = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not sa_value:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")

    # If Firebase app already initialized, skip
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    if os.path.exists(sa_value):
        cred = credentials.Certificate(sa_value)
        firebase_admin.initialize_app(cred)
        return

    # raw JSON
    import json
    sa_dict = json.loads(sa_value)
    cred = credentials.Certificate(sa_dict)
    firebase_admin.initialize_app(cred)


def main():
    init_admin()

    # Prefer UID. Email lookup supported too.
    target_uid = os.getenv("TARGET_UID")
    target_email = os.getenv("TARGET_EMAIL")

    if not target_uid and not target_email:
        raise RuntimeError("Set TARGET_UID or TARGET_EMAIL")

    if not target_uid and target_email:
        user = auth.get_user_by_email(target_email)
        target_uid = user.uid

    auth.set_custom_user_claims(target_uid, {"role": "admin"})
    print(f"✅ Set admin claim for uid={target_uid}")
    print("⚠️ User must log out/in (or refresh token) to see updated claims.")


if __name__ == "__main__":
    main()
