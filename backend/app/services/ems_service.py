import os
from google.cloud import firestore
from google.oauth2 import service_account
from datetime import datetime
from typing import Optional

CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials/google_service_account.json")
EMS_COLLECTION = "issues"  # Firestore collection name — confirm karo EMS repo se


def get_firestore_client():
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH,
        scopes=["https://www.googleapis.com/auth/datastore"]
    )
    return firestore.Client(
        project=os.getenv("FIREBASE_PROJECT_ID"),
        credentials=creds
    )


# ─── Create ───────────────────────────────────────────────────────────────────

def ems_create_issue(
    title: str,
    description: str,
    issue_type: str = "issue",
    module: Optional[str] = None,
    note: Optional[str] = None
) -> dict:
    try:
        db = get_firestore_client()

        doc_ref = db.collection(EMS_COLLECTION).add({
            "title": title,
            "description": description,
            "type": issue_type,
            "module": module or "General",
            "note": note or "",
            "status": "open",
            "createdAt": datetime.utcnow(),
            "resolvedAt": None
        })

        return {
            "success": True,
            "ems_issue_id": doc_ref[1].id,
            "title": title
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Update ───────────────────────────────────────────────────────────────────

def ems_update_issue(issue_id: str, new_description: str) -> dict:
    try:
        db = get_firestore_client()

        db.collection(EMS_COLLECTION).document(issue_id).update({
            "description": new_description,
            "status": "in_progress",
            "updatedAt": datetime.utcnow()
        })

        return {"success": True, "ems_issue_id": issue_id}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Resolve ──────────────────────────────────────────────────────────────────

def ems_resolve_issue(issue_id: str) -> dict:
    try:
        db = get_firestore_client()

        db.collection(EMS_COLLECTION).document(issue_id).update({
            "status": "resolved",
            "resolvedAt": datetime.utcnow()
        })

        return {"success": True, "ems_issue_id": issue_id}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Get all open issues ──────────────────────────────────────────────────────

def ems_get_all_issues() -> list[dict]:
    try:
        db = get_firestore_client()

        docs = db.collection(EMS_COLLECTION)\
                 .where("status", "==", "open")\
                 .stream()

        return [{"id": doc.id, **doc.to_dict()} for doc in docs]

    except Exception as e:
        print(f"Firestore fetch error: {e}")
        return []