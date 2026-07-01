import os
import re
import pickle
from datetime import date
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/documents",
]
TOKEN_PATH = "credentials/token.pickle"
CLIENT_SECRET_PATH = "credentials/client_secret.json"


def get_docs_service():
    creds = None

    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "rb") as token:
            creds = pickle.load(token)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CLIENT_SECRET_PATH, SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open(TOKEN_PATH, "wb") as token:
            pickle.dump(creds, token)

    return build("docs", "v1", credentials=creds)


def get_document(doc_id: str):
    service = get_docs_service()
    return service.documents().get(documentId=doc_id).execute()


def _get_doc_text(doc) -> str:
    text = ""
    for block in doc.get("body", {}).get("content", []):
        for elem in block.get("paragraph", {}).get("elements", []):
            text += elem.get("textRun", {}).get("content", "")
    return text


def _get_last_issue_number(doc) -> int:
    text = _get_doc_text(doc)
    # Naya format: "Issue #5"
    new_format = re.findall(r"Issue #(\d+)", text)
    if new_format:
        return max([int(n) for n in new_format], default=0)
    # Purana format fallback: "5."
    old_format = re.findall(r"^\s*(\d+)\.", text, re.MULTILINE)
    return max([int(n) for n in old_format], default=0)


def _find_issue_range(doc, issue_number: int):
    start = None
    end = None
    index = 1

    for block in doc.get("body", {}).get("content", []):
        para = block.get("paragraph", {})
        full_text = ""
        for elem in para.get("elements", []):
            full_text += elem.get("textRun", {}).get("content", "")

        if re.match(rf"^\s*{issue_number}\.", full_text):
            start = index
        elif start is not None and re.match(r"^\s*\d+\.", full_text):
            end = index
            break

        for elem in para.get("elements", []):
            index += len(elem.get("textRun", {}).get("content", ""))

    if start and not end:
        end = index

    return (start, end) if start else None


from datetime import date

def create_issue(title, description, issue_type="issue", module=None, note=None, doc_id=None, observations=None, priority="medium", status="open"):
    if not doc_id:
        return {"error": "No Google Doc ID provided"}
    try:
        from datetime import date
        service = get_docs_service()
        doc = get_document(doc_id)

        next_number  = _get_last_issue_number(doc) + 1
        body_content = doc.get("body", {}).get("content", [])
        last_element = body_content[-1] if body_content else None
        insert_index = last_element.get("endIndex", 1) - 1 if last_element else 1

        today        = date.today().strftime("%d %b %Y")
        type_label   = "ISSUE" if issue_type == "issue" else "FEATURE"
        module_tag   = f" [{module.upper()}]" if module else ""
        priority_str = (priority or "medium").upper()
        status_str   = (status or "open").upper().replace("_", " ")

        # Observations block
        obs_text = ""
        if observations:
            obs_lines = "\n".join([f"   • {o}" for o in observations])
            obs_text  = f"\nObservations:\n{obs_lines}"

        note_text = f"\n   NOTE: {note}" if note else ""

        new_text = (
            f"\nIssue #{next_number}{module_tag}\n"
            f"Title: {title}\n"
            f"Type: {type_label}\n"
            f"Description:\n   {description}"
            f"{obs_text}"
            f"\nStatus: {status_str}   Priority: {priority_str}   Created On: {today}"
            f"{note_text}\n"
            f"{'─' * 50}\n"
        )

        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{"insertText": {"location": {"index": insert_index}, "text": new_text}}]}
        ).execute()

        print(f"✓ Issue #{next_number} added to doc: {doc_id}")
        return {"issue_number": next_number, "title": title, "action": "created"}

    except Exception as e:
        return {"error": str(e)}

def update_issue(issue_number, new_description, doc_id=None):
    if not doc_id:
        return {"error": "No Google Doc ID provided"}
    try:
        service = get_docs_service()
        doc = get_document(doc_id)
        range_result = _find_issue_range(doc, issue_number)
        if not range_result:
            return {"error": f"Issue #{issue_number} not found"}
        
        _, end_index = range_result
        
        # end_index pe newline ho sakta hai — usse ek peeche karo
        insert_at = end_index - 1
        if insert_at < 1:
            insert_at = 1
            
        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{
                "insertText": {
                    "location": {"index": insert_at},
                    "text": f"\n   UPDATE: {new_description}"  # ← newline pehle, baad mein text
                }
            }]}
        ).execute()
        return {"issue_number": issue_number, "action": "updated"}
    except Exception as e:
        return {"error": str(e)}


def resolve_issue(issue_number, doc_id=None):
    if not doc_id:
        return {"error": "No Google Doc ID provided"}
    try:
        service = get_docs_service()
        doc = get_document(doc_id)
        range_result = _find_issue_range(doc, issue_number)
        if not range_result:
            return {"error": f"Issue #{issue_number} not found"}

        start, end = range_result
        safe_end = end - 1
        if safe_end <= start:
            safe_end = end

        # Delete the issue
        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{
                "deleteContentRange": {
                    "range": {
                        "startIndex": start - 1 if start > 1 else start,
                        "endIndex": safe_end
                    }
                }
            }]}
        ).execute()

        # Renumber remaining issues
        _renumber_issues(doc_id)

        return {"issue_number": issue_number, "action": "resolved"}
    except Exception as e:
        return {"error": str(e)}


def _renumber_issues(doc_id: str):
    try:
        service = get_docs_service()
        doc = get_document(doc_id)
        text = _get_doc_text(doc)

        # Find all issue number positions
        requests = []
        new_number = 1

        for block in doc.get("body", {}).get("content", []):
            para = block.get("paragraph", {})
            full_text = ""
            start_index = None

            for elem in para.get("elements", []):
                content = elem.get("textRun", {}).get("content", "")
                if start_index is None:
                    start_index = elem.get("startIndex", 0)
                full_text += content

            match = re.match(r"^(\d+)\.", full_text.strip())
            if match:
                old_number = match.group(1)
                old_text = f"{old_number}."
                new_text = f"{new_number}."

                if old_text != new_text:
                    # Find exact position of the number in this paragraph
                    requests.append({
                        "replaceAllText": {
                            "containsText": {
                                "text": f"\n{old_number}.",
                                "matchCase": True
                            },
                            "replaceText": f"\n{new_number}."
                        }
                    })
                new_number += 1

        if requests:
            service.documents().batchUpdate(
                documentId=doc_id,
                body={"requests": requests}
            ).execute()

    except Exception as e:
        print(f"Renumber error: {e}")
def get_all_issues(doc_id=None):
    if not doc_id:
        return []
    try:
        doc  = get_document(doc_id)
        text = _get_doc_text(doc)
        issues = []

        # Naya format: "Issue #1 [MODULE]" ya "Issue #1"
        pattern = re.compile(
            r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
            r"Title:\s*(.+?)\s*\n"
            r".*?Status:\s*([\w ]+?)\s+Priority:\s*(\w+)\s+Created On:\s*(.+?)(?=\nIssue #|\Z)",
            re.DOTALL
        )

        for match in pattern.finditer(text):
            number   = int(match.group(1))
            title    = match.group(2).strip()
            status   = match.group(3).strip().lower().replace(" ", "_")
            priority = match.group(4).strip().lower()
            created  = match.group(5).strip().split("\n")[0]

            if not title:
                continue

            issues.append({
                "number":   number,
                "title":    title,
                "status":   status,
                "priority": priority,
                "created":  created,
            })

        return issues
    except Exception as e:
        print(f"Doc fetch error: {e}")
        return []

# def get_all_issues(doc_id=None):
#     if not doc_id:
#         return []
#     try:
#         doc = get_document(doc_id)
#         text = _get_doc_text(doc)
#         issues = []
#         for match in re.finditer(r"(\d+)\.\s+(.+?)(?=\n\d+\.|\Z)", text, re.DOTALL):
#             number = int(match.group(1))
#             raw = match.group(2).strip()
            
#             # skip if empty after strip
#             if not raw:
#                 continue
                
#             title = raw.split("\n")[0][:80].strip()
            
#             # skip if title is empty
#             if not title:
#                 continue

#             issues.append({"number": number, "title": title})
#         return issues
#     except Exception as e:
#         print(f"Doc fetch error: {e}")
#         return []