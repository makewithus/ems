# # import os
# # import re
# # import pickle
# # from datetime import date
# # from dotenv import load_dotenv
# # from google.auth.transport.requests import Request
# # from google_auth_oauthlib.flow import InstalledAppFlow
# # from googleapiclient.discovery import build

# # load_dotenv()

# # SCOPES = ["https://www.googleapis.com/auth/documents"]
# # TOKEN_PATH = "credentials/token.pickle"
# # CLIENT_SECRET_PATH = "credentials/client_secret.json"


# # def get_docs_service():
# #     creds = None
# #     if os.path.exists(TOKEN_PATH):
# #         with open(TOKEN_PATH, "rb") as token:
# #             creds = pickle.load(token)
# #     if not creds or not creds.valid:
# #         if creds and creds.expired and creds.refresh_token:
# #             creds.refresh(Request())
# #         else:
# #             flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_PATH, SCOPES)
# #             creds = flow.run_local_server(port=0)
# #         with open(TOKEN_PATH, "wb") as token:
# #             pickle.dump(creds, token)
# #     return build("docs", "v1", credentials=creds)


# # def get_document(doc_id: str):        # ← yeh hona chahiye
# #     service = get_docs_service()
# #     return service.documents().get(documentId=doc_id).execute()


# # def _get_doc_text(doc) -> str:
# #     text = ""
# #     for block in doc.get("body", {}).get("content", []):
# #         for elem in block.get("paragraph", {}).get("elements", []):
# #             text += elem.get("textRun", {}).get("content", "")
# #     return text


# # def _get_last_issue_number(doc) -> int:
# #     text = _get_doc_text(doc)
# #     new_format = re.findall(r"Issue #(\d+)", text)
# #     if new_format:
# #         return max([int(n) for n in new_format], default=0)
# #     old_format = re.findall(r"^\s*(\d+)\.", text, re.MULTILINE)
# #     return max([int(n) for n in old_format], default=0)


# # def _find_issue_range(doc, issue_number: int):
# #     """Naye aur purane dono formats support karta hai."""
# #     start = None
# #     end   = None
# #     index = 1

# #     for block in doc.get("body", {}).get("content", []):
# #         para      = block.get("paragraph", {})
# #         full_text = ""
# #         for elem in para.get("elements", []):
# #             full_text += elem.get("textRun", {}).get("content", "")

# #         # Naya format: "Issue #5" ya "Issue #5 [MODULE]"
# #         new_fmt = re.match(rf"^\s*Issue #{issue_number}(?:\s*\[|$|\s*\n)", full_text)
# #         # Purana format: "5."
# #         old_fmt = re.match(rf"^\s*{issue_number}\.", full_text)

# #         if new_fmt or old_fmt:
# #             start = index
# #         elif start is not None:
# #             next_new = re.match(r"^\s*Issue #\d+", full_text)
# #             next_old = re.match(r"^\s*\d+\.", full_text)
# #             if next_new or next_old:
# #                 end = index
# #                 break

# #         for elem in para.get("elements", []):
# #             index += len(elem.get("textRun", {}).get("content", ""))

# #     if start and not end:
# #         end = index

# #     return (start, end) if start else None


# # def _find_status_position(doc, issue_number: int):
# #     """Issue ka status position find karo Google Doc mein."""
# #     text = _get_doc_text(doc)

# #     issue_pattern = re.compile(
# #         rf"(Issue #{issue_number}(?:\s*\[[^\]]*\])?.*?)(Status:\s*\w[\w ]*?)(\s+Priority:)",
# #         re.DOTALL
# #     )
# #     issue_match = issue_pattern.search(text)
# #     if not issue_match:
# #         return None, None

# #     status_start_char = issue_match.start(2)
# #     status_end_char   = issue_match.end(2)

# #     char_count  = 0
# #     start_index = None
# #     end_index   = None

# #     for block in doc.get("body", {}).get("content", []):
# #         for elem in block.get("paragraph", {}).get("elements", []):
# #             content    = elem.get("textRun", {}).get("content", "")
# #             elem_start = elem.get("startIndex", 0)
# #             for i, ch in enumerate(content):
# #                 if char_count == status_start_char:
# #                     start_index = elem_start + i
# #                 if char_count == status_end_char:
# #                     end_index = elem_start + i
# #                 char_count += 1

# #     return start_index, end_index


# # def create_issue(title, description, issue_type="issue", module=None,
# #                  note=None, doc_id=None, observations=None,
# #                  priority="medium", status="open"):
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service      = get_docs_service()
# #         doc          = get_document(doc_id)
# #         next_number  = _get_last_issue_number(doc) + 1
# #         body_content = doc.get("body", {}).get("content", [])
# #         last_element = body_content[-1] if body_content else None
# #         insert_index = last_element.get("endIndex", 1) - 1 if last_element else 1

# #         today        = date.today().strftime("%d %b %Y")
# #         type_label   = "ISSUE" if issue_type == "issue" else "FEATURE"
# #         module_tag   = f" [{module.upper()}]" if module else ""
# #         priority_str = (priority or "medium").upper()
# #         status_str   = (status or "open").upper().replace("_", " ")

# #         obs_text  = ""
# #         if observations:
# #             obs_lines = "\n".join([f"   • {o}" for o in observations])
# #             obs_text  = f"\nObservations:\n{obs_lines}"

# #         note_text = f"\n   NOTE: {note}" if note else ""

# #         new_text = (
# #             f"\nIssue #{next_number}{module_tag}\n"
# #             f"Title: {title}\n"
# #             f"Type: {type_label}\n"
# #             f"Description:\n   {description}"
# #             f"{obs_text}"
# #             f"\nStatus: {status_str}   Priority: {priority_str}   Created On: {today}"
# #             f"{note_text}\n"
# #             f"{'─' * 50}\n"
# #         )

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [{"insertText": {"location": {"index": insert_index}, "text": new_text}}]}
# #         ).execute()

# #         print(f"✓ Issue #{next_number} added to doc: {doc_id}")
# #         return {"issue_number": next_number, "title": title, "action": "created"}

# #     except Exception as e:
# #         return {"error": str(e)}


# # def update_issue(issue_number, new_description, doc_id=None):
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service      = get_docs_service()
# #         doc          = get_document(doc_id)
# #         range_result = _find_issue_range(doc, issue_number)
# #         if not range_result:
# #             return {"error": f"Issue #{issue_number} not found"}

# #         _, end_index = range_result
# #         insert_at    = end_index - 1
# #         if insert_at < 1:
# #             insert_at = 1

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [{"insertText": {
# #                 "location": {"index": insert_at},
# #                 "text": f"\n   UPDATE: {new_description}"
# #             }}]}
# #         ).execute()
# #         return {"issue_number": issue_number, "action": "updated"}
# #     except Exception as e:
# #         return {"error": str(e)}


# # def update_issue_status(issue_number, new_status, doc_id=None):
# #     """Sirf status change karo — issue delete mat karo."""
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service = get_docs_service()
# #         doc     = get_document(doc_id)

# #         start_index, end_index = _find_status_position(doc, issue_number)
# #         if start_index is None or end_index is None:
# #             return {"error": f"Issue #{issue_number} status not found"}

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [
# #                 {"deleteContentRange": {"range": {"startIndex": start_index, "endIndex": end_index}}},
# #                 {"insertText": {"location": {"index": start_index}, "text": f"Status: {new_status.upper()}"}}
# #             ]}
# #         ).execute()

# #         return {"issue_number": issue_number, "action": "status_updated", "new_status": new_status}
# #     except Exception as e:
# #         return {"error": str(e)}


# # def resolve_issue(issue_number, doc_id=None):
# #     """Status RESOLVED karo — delete nahi karo."""
# #     return update_issue_status(issue_number, "RESOLVED", doc_id)


# # def delete_issue(issue_number, doc_id=None):
# #     """Issue completely delete karo Google Doc se."""
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service      = get_docs_service()
# #         doc          = get_document(doc_id)
# #         range_result = _find_issue_range(doc, issue_number)
# #         if not range_result:
# #             return {"error": f"Issue #{issue_number} not found"}

# #         start, end = range_result
# #         safe_end   = end - 1
# #         if safe_end <= start:
# #             safe_end = end

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [{"deleteContentRange": {
# #                 "range": {
# #                     "startIndex": start - 1 if start > 1 else start,
# #                     "endIndex":   safe_end
# #                 }
# #             }}]}
# #         ).execute()

# #         _renumber_issues(doc_id)
# #         return {"issue_number": issue_number, "action": "deleted"}
# #     except Exception as e:
# #         return {"error": str(e)}


# # def _renumber_issues(doc_id: str):
# #     try:
# #         service  = get_docs_service()
# #         doc      = get_document(doc_id)
# #         requests = []
# #         new_number = 1

# #         for block in doc.get("body", {}).get("content", []):
# #             para       = block.get("paragraph", {})
# #             full_text  = ""
# #             for elem in para.get("elements", []):
# #                 full_text += elem.get("textRun", {}).get("content", "")

# #             match = re.match(r"^(\d+)\.", full_text.strip())
# #             if match:
# #                 old_number = match.group(1)
# #                 if old_number != str(new_number):
# #                     requests.append({
# #                         "replaceAllText": {
# #                             "containsText": {"text": f"\n{old_number}.", "matchCase": True},
# #                             "replaceText":  f"\n{new_number}."
# #                         }
# #                     })
# #                 new_number += 1

# #         if requests:
# #             service.documents().batchUpdate(
# #                 documentId=doc_id,
# #                 body={"requests": requests}
# #             ).execute()
# #     except Exception as e:
# #         print(f"Renumber error: {e}")

# # def get_all_issues(doc_id=None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc  = get_document(doc_id)
# #         text = _get_doc_text(doc)
# #         issues = []

# #         # Naya format: "Issue #4 [MODULE]" or "Issue #4"
# #         pattern = re.compile(
# #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# #             r"Title:\s*(.+?)\s*\n"
# #             r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)\s{2,}Created On:\s*(.+?)(?=\n─|\nIssue #|\Z)",
# #             re.DOTALL
# #         )

# #         status_map = {
# #             "open":        "open",
# #             "in progress": "in_progress",
# #             "in_progress": "in_progress",
# #             "testing":     "testing",
# #             "blocked":     "blocked",
# #             "resolved":    "resolved",
# #             "closed":      "closed",
# #         }

# #         for match in pattern.finditer(text):
# #             number   = int(match.group(1))
# #             title    = match.group(2).strip()
# #             status   = match.group(3).strip().lower()
# #             priority = match.group(4).strip().lower()
# #             created  = match.group(5).strip().split("\n")[0].strip()

# #             if not title:
# #                 continue

# #             issues.append({
# #                 "number":   number,
# #                 "title":    title,
# #                 "status":   status_map.get(status, "open"),
# #                 "priority": priority,
# #                 "created":  created,
# #             })

# #         print(f"✓ Found {len(issues)} issues")
# #         return issues

# #     except Exception as e:
# #         print(f"Doc fetch error: {e}")
# #         return []
    
# # # def get_all_issues(doc_id=None):
# # #     if not doc_id:
# # #         return []
# # #     try:
# # #         doc  = get_document(doc_id)
# # #         text = _get_doc_text(doc)
# # #         issues = []

# # #         # Naya format: "Issue #1 [MODULE]"
# # #         new_pattern = re.compile(
# # #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# # #             r"Title:\s*(.+?)\s*\n"
# # #             r".*?Status:\s*([\w ]+?)\s+Priority:\s*(\w+)\s+Created On:\s*(.+?)(?=\nIssue #|\Z)",
# # #             re.DOTALL
# # #         )
# # #         for match in new_pattern.finditer(text):
# # #             number   = int(match.group(1))
# # #             title    = match.group(2).strip()
# # #             status   = match.group(3).strip().lower().replace(" ", "_")
# # #             priority = match.group(4).strip().lower()
# # #             created  = match.group(5).strip().split("\n")[0]
# # #             if title:
# # #                 issues.append({
# # #                     "number": number, "title": title,
# # #                     "status": status, "priority": priority, "created": created,
# # #                 })

# # #         # Purana format fallback: "1. TITLE\n   ISSUE: desc"
# # #         if not issues:
# # #             old_pattern = re.compile(
# # #                 r"(\d+)\.\s+(.+?)(?=\n\d+\.|\Z)",
# # #                 re.DOTALL
# # #             )
# # #             for match in old_pattern.finditer(text):
# # #                 number = int(match.group(1))
# # #                 raw    = match.group(2).strip()
# # #                 title  = raw.split("\n")[0][:80].strip()
# # #                 if title:
# # #                     issues.append({
# # #                         "number": number, "title": title,
# # #                         "status": "open", "priority": "medium", "created": "",
# # #                     })

# # #         return issues
# # #     except Exception as e:
# # #         print(f"Doc fetch error: {e}")
# # #         return []

# # # def get_all_issues(doc_id=None):
# # #     if not doc_id:
# # #         return []
# # #     try:
# # #         doc  = get_document(doc_id)
# # #         text = _get_doc_text(doc)
# # #         issues = []

# # #         pattern = re.compile(
# # #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# # #             r"Title:\s*(.+?)\s*\n"
# # #             r".*?Status:\s*([\w ]+?)\s+Priority:\s*(\w+)\s+Created On:\s*(.+?)(?=\nIssue #|\Z)",
# # #             re.DOTALL
# # #         )

# # #         for match in pattern.finditer(text):
# # #             number   = int(match.group(1))
# # #             title    = match.group(2).strip()
# # #             status   = match.group(3).strip().lower().replace(" ", "_")
# # #             priority = match.group(4).strip().lower()
# # #             created  = match.group(5).strip().split("\n")[0]

# # #             if not title:
# # #                 continue

# # #             issues.append({
# # #                 "number":   number,
# # #                 "title":    title,
# # #                 "status":   status,
# # #                 "priority": priority,
# # #                 "created":  created,
# # #             })

# # #         return issues
# # #     except Exception as e:
# # #         print(f"Doc fetch error: {e}")
# # #         return []


# # def get_drive_service():
# #     creds = None
# #     if os.path.exists(TOKEN_PATH):
# #         with open(TOKEN_PATH, "rb") as token:
# #             creds = pickle.load(token)
# #     if not creds or not creds.valid:
# #         if creds and creds.expired and creds.refresh_token:
# #             creds.refresh(Request())
# #         else:
# #             flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_PATH, SCOPES)
# #             creds = flow.run_local_server(port=0)
# #         with open(TOKEN_PATH, "wb") as token:
# #             pickle.dump(creds, token)
# #     return build("drive", "v3", credentials=creds)


# # def search_docs(query: str = "") -> list:
# #     try:
# #         service = get_drive_service()
# #         q = "mimeType='application/vnd.google-apps.document' and trashed=false"
# #         if query:
# #             q += f" and name contains '{query}'"
# #         results = service.files().list(
# #             q=q, pageSize=10,
# #             fields="files(id, name, modifiedTime, webViewLink)"
# #         ).execute()
# #         return results.get("files", [])
# #     except Exception as e:
# #         print(f"Drive search error: {e}")
# #         return []


# # def create_new_doc(title: str) -> dict:
# #     try:
# #         service = get_docs_service()
# #         doc     = service.documents().create(body={"title": title}).execute()
# #         doc_id  = doc["documentId"]
# #         return {
# #             "id":          doc_id,
# #             "name":        title,
# #             "webViewLink": f"https://docs.google.com/document/d/{doc_id}/edit"
# #         }
# #     except Exception as e:
# #         return {"error": str(e)}
# import os
# import re
# import json
# import tempfile
# from datetime import date
# from dotenv import load_dotenv
# from google.oauth2 import service_account
# from googleapiclient.discovery import build
# from functools import lru_cache

# load_dotenv()

# SCOPES = [
#     "https://www.googleapis.com/auth/documents",
#     "https://www.googleapis.com/auth/drive",
# ]

# @lru_cache(maxsize=1)
# def get_credentials():
#     """Service Account se credentials lo."""
#     creds_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
#     if creds_json:
#         creds_dict = json.loads(creds_json)
#         return service_account.Credentials.from_service_account_info(
#             creds_dict, scopes=SCOPES
#         )
#     # Local fallback
#     creds_path = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials/google_service_account.json")
#     return service_account.Credentials.from_service_account_file(
#         creds_path, scopes=SCOPES
#     )


# @lru_cache(maxsize=1)
# def get_docs_service():
#     return build("docs", "v1", credentials=get_credentials())


# @lru_cache(maxsize=1)
# def get_drive_service():
#     return build("drive", "v3", credentials=get_credentials())
# # def get_credentials():
# #     """Service Account se credentials lo."""
# #     creds_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
# #     if creds_json:
# #         creds_dict = json.loads(creds_json)
# #         return service_account.Credentials.from_service_account_info(
# #             creds_dict, scopes=SCOPES
# #         )
# #     # Local fallback
# #     creds_path = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials/google_service_account.json")
# #     return service_account.Credentials.from_service_account_file(
# #         creds_path, scopes=SCOPES
# #     )


# # def get_docs_service():
# #     return build("docs", "v1", credentials=get_credentials())


# # def get_drive_service():
# #     return build("drive", "v3", credentials=get_credentials())

# def get_document(doc_id: str, tab_id: str = None):
#     service = get_docs_service()
#     if tab_id:
#         return service.documents().get(
#             documentId=doc_id,
#             includeTabsContent=True
#         ).execute()
#     return service.documents().get(
#         documentId=doc_id,
#         includeTabsContent=True
#     ).execute()
# def _get_tab_content(doc, tab_id: str = None):
#     """Specific tab ka content nikalo"""
#     tabs = doc.get("tabs", [])
    
#     if not tabs:
#         # Old format — no tabs
#         return doc.get("body", {}).get("content", [])
    
#     if tab_id:
#         # Specific tab dhundo
#         for tab in tabs:
#             doc_tab = tab.get("documentTab", {})
#             tab_props = tab.get("tabProperties", {})
#             if tab_props.get("tabId") == tab_id:
#                 return doc_tab.get("body", {}).get("content", [])
#             # Child tabs bhi check karo
#             for child in tab.get("childTabs", []):
#                 child_props = child.get("tabProperties", {})
#                 if child_props.get("tabId") == tab_id:
#                     return child.get("documentTab", {}).get("body", {}).get("content", [])
    
#     # Tab ID nahi diya — "issues" naam ka tab dhundo
#     for tab in tabs:
#         tab_props = tab.get("tabProperties", {})
#         tab_title = tab_props.get("title", "").lower()
#         if "issue" in tab_title:
#             return tab.get("documentTab", {}).get("body", {}).get("content", [])
    
#     # Fallback — pehla tab
#     if tabs:
#         return tabs[0].get("documentTab", {}).get("body", {}).get("content", [])
    
#     return doc.get("body", {}).get("content", [])

# def _get_tab_id(doc, tab_name: str = "issues") -> str | None:
#     """Tab name se tab ID nikalo"""
#     tabs = doc.get("tabs", [])
#     for tab in tabs:
#         tab_props = tab.get("tabProperties", {})
#         if tab_name.lower() in tab_props.get("title", "").lower():
#             return tab_props.get("tabId")
#     return None
# # def get_document(doc_id: str):
# #     service = get_docs_service()
# #     return service.documents().get(documentId=doc_id).execute()
# def _get_doc_text(doc, tab_id: str = None) -> str:
#     content = _get_tab_content(doc, tab_id)
#     text = ""
#     for block in content:
#         for elem in block.get("paragraph", {}).get("elements", []):
#             text += elem.get("textRun", {}).get("content", "")
#     return text


# # def _get_last_issue_number(doc, tab_id: str = None) -> int:
# #     text = _get_doc_text(doc, tab_id)
# #     new_format = re.findall(r"Issue #(\d+)", text)
# #     if new_format:
# #         return max([int(n) for n in new_format], default=0)
# #     old_format = re.findall(r"^\s*(\d+)\.", text, re.MULTILINE)
# #     return max([int(n) for n in old_format], default=0)
# def _get_last_issue_number(doc, tab_id: str = None) -> int:
#     """Saare tabs mein se highest issue number nikalo"""
#     all_text = ""
#     tabs = doc.get("tabs", [])
    
#     if tabs:
#         # Saare tabs ka text combine karo — global numbering ke liye
#         for tab in tabs:
#             doc_tab = tab.get("documentTab", {})
#             content = doc_tab.get("body", {}).get("content", [])
#             for block in content:
#                 for elem in block.get("paragraph", {}).get("elements", []):
#                     all_text += elem.get("textRun", {}).get("content", "")
#             for child in tab.get("childTabs", []):
#                 child_content = child.get("documentTab", {}).get("body", {}).get("content", [])
#                 for block in child_content:
#                     for elem in block.get("paragraph", {}).get("elements", []):
#                         all_text += elem.get("textRun", {}).get("content", "")
#     else:
#         all_text = _get_doc_text(doc)

#     # Dono formats check karo
#     new_format = re.findall(r"Issue #(\d+)", all_text)
#     old_format = re.findall(r"^\s*(\d+)\.", all_text, re.MULTILINE)
    
#     all_numbers = [int(n) for n in new_format + old_format]
#     return max(all_numbers, default=0) 

# # def _get_doc_text(doc) -> str:
# #     text = ""
# #     for block in doc.get("body", {}).get("content", []):
# #         for elem in block.get("paragraph", {}).get("elements", []):
# #             text += elem.get("textRun", {}).get("content", "")
# #     return text


# # def _get_last_issue_number(doc) -> int:
# #     text = _get_doc_text(doc)
# #     new_format = re.findall(r"Issue #(\d+)", text)
# #     if new_format:
# #         return max([int(n) for n in new_format], default=0)
# #     old_format = re.findall(r"^\s*(\d+)\.", text, re.MULTILINE)
# #     return max([int(n) for n in old_format], default=0)

# def _find_issue_range(doc, issue_number: int, tab_id: str = None):
#     content = _get_tab_content(doc, tab_id)
#     start = None
#     end = None

#     for block in content:
#         para = block.get("paragraph", {})
#         full_text = "".join(
#             elem.get("textRun", {}).get("content", "")
#             for elem in para.get("elements", [])
#         )
#         block_start = block.get("startIndex")
#         block_end = block.get("endIndex")

#         this_issue = re.match(rf"^\s*{issue_number}\.\s+", full_text)
#         any_issue  = re.match(r"^\s*\d+\.\s+", full_text)

#         if this_issue and start is None:
#             start = block_start
#         elif start is not None and any_issue:
#             end = block_start
#             break

#     if start is not None and end is None and content:
#         end = content[-1].get("endIndex", start)

#     return (start, end) if start is not None else None

# # def _find_issue_range(doc, issue_number: int):
# #     start = None
# #     end   = None
# #     index = 1

# #     # Tabs support ke saath content lo
# #     all_blocks = []
    
# #     # Pehle tabs check karo
# #     tabs = doc.get("tabs", [])
# #     if tabs:
# #         for tab in tabs:
# #             tab_props = tab.get("documentTab", {}).get("properties", {})
# #             if tab_props.get("title", "").lower() == "issues":
# #                 body = tab.get("documentTab", {}).get("body", {})
# #                 all_blocks = body.get("content", [])
# #                 break
# #         if not all_blocks:
# #             # Koi bhi tab ka content lo
# #             for tab in tabs:
# #                 body = tab.get("documentTab", {}).get("body", {})
# #                 content = body.get("content", [])
# #                 if content:
# #                     all_blocks = content
# #                     break
    
# #     # Fallback — normal body
# #     if not all_blocks:
# #         all_blocks = doc.get("body", {}).get("content", [])

# #     for block in all_blocks:
# #         para      = block.get("paragraph", {})
# #         full_text = ""
# #         for elem in para.get("elements", []):
# #             full_text += elem.get("textRun", {}).get("content", "")

# #         # Naya format: "Issue #1" ya "Issue #1 [MODULE]"
# #         new_fmt = re.match(
# #             rf"^\s*Issue #{issue_number}(?:\s*\[|\s*\n|$)", 
# #             full_text
# #         )
# #         # Purana format: "1."
# #         old_fmt = re.match(rf"^\s*{issue_number}\.", full_text)

# #         if new_fmt or old_fmt:
# #             start = index
# #         elif start is not None:
# #             next_new = re.match(r"^\s*Issue #\d+", full_text)
# #             next_old = re.match(r"^\s*\d+\.", full_text)
# #             # Divider line bhi end mark kare
# #             divider  = re.match(r"^\s*─+", full_text)
# #             if next_new or next_old:
# #                 end = index
# #                 break

# #         for elem in para.get("elements", []):
# #             index += len(elem.get("textRun", {}).get("content", ""))

# #     if start and not end:
# #         end = index

# #     return (start, end) if start else None


# # def _find_issue_range(doc, issue_number: int):
# #     start = None
# #     end   = None
# #     index = 1

# #     for block in doc.get("body", {}).get("content", []):
# #         para      = block.get("paragraph", {})
# #         full_text = ""
# #         for elem in para.get("elements", []):
# #             full_text += elem.get("textRun", {}).get("content", "")

# #         new_fmt = re.match(rf"^\s*Issue #{issue_number}(?:\s*\[|$|\s*\n)", full_text)
# #         old_fmt = re.match(rf"^\s*{issue_number}\.", full_text)

# #         if new_fmt or old_fmt:
# #             start = index
# #         elif start is not None:
# #             next_new = re.match(r"^\s*Issue #\d+", full_text)
# #             next_old = re.match(r"^\s*\d+\.", full_text)
# #             if next_new or next_old:
# #                 end = index
# #                 break

# #         for elem in para.get("elements", []):
# #             index += len(elem.get("textRun", {}).get("content", ""))

# #     if start and not end:
# #         end = index

# #     return (start, end) if start else None


# def _find_status_position(doc, issue_number: int):
#     text = _get_doc_text(doc)
#     issue_pattern = re.compile(
#         rf"(Issue #{issue_number}(?:\s*\[[^\]]*\])?.*?)(Status:\s*\w[\w ]*?)(\s+Priority:)",
#         re.DOTALL
#     )
#     issue_match = issue_pattern.search(text)
#     if not issue_match:
#         return None, None

#     status_start_char = issue_match.start(2)
#     status_end_char   = issue_match.end(2)

#     char_count  = 0
#     start_index = None
#     end_index   = None

#     for block in doc.get("body", {}).get("content", []):
#         for elem in block.get("paragraph", {}).get("elements", []):
#             content    = elem.get("textRun", {}).get("content", "")
#             elem_start = elem.get("startIndex", 0)
#             for i, ch in enumerate(content):
#                 if char_count == status_start_char:
#                     start_index = elem_start + i
#                 if char_count == status_end_char:
#                     end_index = elem_start + i
#                 char_count += 1

#     return start_index, end_index


# def create_issue(title, description, issue_type="issue", module=None,
#                  note=None, doc_id=None, observations=None,
#                  priority="medium", status="open", tab_id: str = None):
#     if not doc_id:
#         return {"error": "No Google Doc ID provided"}
#     try:
#         service     = get_docs_service()
#         doc         = get_document(doc_id)
#         next_number = _get_last_issue_number(doc) + 1
#         content     = _get_tab_content(doc, tab_id)
#         last_elem   = content[-1] if content else None
#         insert_idx  = last_elem.get("endIndex", 1) - 1 if last_elem else 1

#         today        = date.today().strftime("%d %b %Y")
#         module_tag   = f" [{module.upper()}]" if module else ""
#         priority_str = (priority or "medium").upper()

#         obs_text = ""
#         if observations and len(observations) > 0:
#             obs_lines = "\n".join([f"• {o}" for o in observations])
#             obs_text  = f"\n{obs_lines}"

#         note_text = f"\n~ {note}" if note else ""

#         # Format exactly like doc
#         # "1. TITLE IN CAPS"
#         # "description in normal text. ~ extra note"
#         # title_line = f"\n{next_number}. {title.upper()}{module_tag}\n"
#         title_line = f"\n{next_number}. {title.upper()}{module_tag} [STATUS: OPEN]\n"
#         desc_line  = f"{description}{obs_text}{note_text}\n"

#         full_text  = title_line + desc_line

#         title_start = insert_idx + 1
#         title_end   = title_start + len(title_line.strip())

#         # Insert text
#         insert_req = {
#             "insertText": {
#                 "location": {"index": insert_idx},
#                 "text": full_text
#             }
#         }

#         # Title bold karo
#         bold_req = {
#             "updateTextStyle": {
#                 "range": {
#                     "startIndex": title_start,
#                     "endIndex":   title_end,
#                 },
#                 "textStyle": {
#                     "bold": True,
#                 },
#                 "fields": "bold"
#             }
#         }

#         if tab_id:
#             insert_req["insertText"]["location"]["tabId"] = tab_id
#             bold_req["updateTextStyle"]["range"]["tabId"] = tab_id

#         service.documents().batchUpdate(
#             documentId=doc_id,
#             body={"requests": [insert_req, bold_req]}
#         ).execute()

#         print(f"✓ Issue #{next_number} added")
#         return {"issue_number": next_number, "title": title, "action": "created"}

#     except Exception as e:
#         return {"error": str(e)}
    


# # def create_issue(title, description, issue_type="issue", module=None,
# #                  note=None, doc_id=None, observations=None,
# #                  priority="medium", status="open", tab_id: str = None):
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service      = get_docs_service()
# #         doc          = get_document(doc_id)
        
# #         # Auto-detect issues tab agar tab_id nahi diya
# #         if not tab_id:
# #             tab_id = _get_tab_id(doc, "issues")
        
# #         next_number  = _get_last_issue_number(doc, tab_id) + 1
# #         content      = _get_tab_content(doc, tab_id)
# #         last_element = content[-1] if content else None
# #         insert_index = last_element.get("endIndex", 1) - 1 if last_element else 1

# #         today        = date.today().strftime("%d %b %Y")
# #         type_label   = "ISSUE" if issue_type == "issue" else "FEATURE"
# #         module_tag   = f" [{module.upper()}]" if module else ""
# #         priority_str = (priority or "medium").upper()

# #         obs_text = ""
# #         if observations and len(observations) > 0:
# #             obs_lines = "\n".join([f"   • {o}" for o in observations])
# #             obs_text  = f"\nObservations:\n{obs_lines}"

# #         note_text = f"\nNote: {note}" if note else ""

# #         new_text = (
# #             f"\nIssue #{next_number}{module_tag}\n"
# #             f"Title: {title}\n"
# #             f"Type: {type_label}\n"
# #             f"Description:\n   {description}"
# #             f"{obs_text}"
# #             f"\nStatus: OPEN   Priority: {priority_str}   Created On: {today}"
# #             f"{note_text}\n"
# #             f"{'─' * 50}\n"
# #         )

# #         request_body = {
# #             "insertText": {
# #                 "location": {"index": insert_index},
# #                 "text": new_text
# #             }
# #         }

# #         # Tab ID hoga toh location mein add karo
# #         if tab_id:
# #             request_body["insertText"]["location"]["tabId"] = tab_id

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [request_body]}
# #         ).execute()

# #         print(f"✓ Issue #{next_number} added to tab '{tab_id}' in doc: {doc_id}")
# #         return {"issue_number": next_number, "title": title, "action": "created"}

# #     except Exception as e:
# #         return {"error": str(e)}
    
# # def create_issue(title, description, issue_type="issue", module=None,
# #                  note=None, doc_id=None, observations=None,
# #                  priority="medium", status="open"):
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service      = get_docs_service()
# #         doc          = get_document(doc_id)
# #         next_number  = _get_last_issue_number(doc) + 1
# #         body_content = doc.get("body", {}).get("content", [])
# #         last_element = body_content[-1] if body_content else None
# #         insert_index = last_element.get("endIndex", 1) - 1 if last_element else 1

# #         today        = date.today().strftime("%d %b %Y")
# #         type_label   = "ISSUE" if issue_type == "issue" else "FEATURE"
# #         module_tag   = f" [{module.upper()}]" if module else ""
# #         priority_str = (priority or "medium").upper()
# #         status_str   = (status or "open").upper().replace("_", " ")

# #         obs_text = ""
# #         if observations:
# #             obs_lines = "\n".join([f"   • {o}" for o in observations])
# #             obs_text  = f"\nObservations:\n{obs_lines}"

# #         note_text = f"\n   NOTE: {note}" if note else ""

# #         new_text = (
# #             f"\nIssue #{next_number}{module_tag}\n"
# #             f"Title: {title}\n"
# #             f"Type: {type_label}\n"
# #             f"Description:\n   {description}"
# #             f"{obs_text}"
# #             f"\nStatus: {status_str}   Priority: {priority_str}   Created On: {today}"
# #             f"{note_text}\n"
# #             f"{'─' * 50}\n"
# #         )

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [{"insertText": {
# #                 "location": {"index": insert_index},
# #                 "text": new_text
# #             }}]}
# #         ).execute()

# #         print(f"✓ Issue #{next_number} added to doc: {doc_id}")
# #         return {"issue_number": next_number, "title": title, "action": "created"}

# #     except Exception as e:
# #         return {"error": str(e)}


# def update_issue(issue_number, new_description, doc_id=None):
#     if not doc_id:
#         return {"error": "No Google Doc ID provided"}
#     try:
#         service      = get_docs_service()
#         doc          = get_document(doc_id)
#         range_result = _find_issue_range(doc, issue_number)
#         if not range_result:
#             return {"error": f"Issue #{issue_number} not found"}

#         _, end_index = range_result
#         insert_at    = end_index - 1
#         if insert_at < 1:
#             insert_at = 1

#         service.documents().batchUpdate(
#             documentId=doc_id,
#             body={"requests": [{"insertText": {
#                 "location": {"index": insert_at},
#                 "text": f"\n   UPDATE: {new_description}"
#             }}]}
#         ).execute()
#         return {"issue_number": issue_number, "action": "updated"}
#     except Exception as e:
#         return {"error": str(e)}


# def update_issue_status(issue_number, new_status, doc_id=None):
#     if not doc_id:
#         return {"error": "No Google Doc ID provided"}
#     try:
#         service = get_docs_service()
#         doc     = get_document(doc_id)

#         start_index, end_index = _find_status_position(doc, issue_number)
#         if start_index is None or end_index is None:
#             return {"error": f"Issue #{issue_number} status not found"}

#         service.documents().batchUpdate(
#             documentId=doc_id,
#             body={"requests": [
#                 {"deleteContentRange": {"range": {"startIndex": start_index, "endIndex": end_index}}},
#                 {"insertText": {"location": {"index": start_index}, "text": f"Status: {new_status.upper()}"}}
#             ]}
#         ).execute()

#         return {"issue_number": issue_number, "action": "status_updated", "new_status": new_status}
#     except Exception as e:
#         return {"error": str(e)}
    
# def _find_status_range(doc, issue_number: int, tab_id: str = None):
#     content = _get_tab_content(doc, tab_id)
#     for block in content:
#         para = block.get("paragraph", {})
#         elements = para.get("elements", [])
#         full_text = "".join(e.get("textRun", {}).get("content", "") for e in elements)

#         if re.match(rf"^\s*{issue_number}\.\s+", full_text):
#             m = re.search(r"\[STATUS:\s*(\w+)\]", full_text)
#             if not m:
#                 return None
#             block_start = block.get("startIndex", 0)
#             return block_start + m.start(1), block_start + m.end(1)
#     return None

# # def resolve_issue(issue_number, doc_id=None, tab_id: str = None):
# #     """Issue ko poora remove karo doc se (resolve = delete)."""
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service = get_docs_service()
# #         doc     = get_document(doc_id)

# #         if not tab_id:
# #             tab_id = _get_tab_id(doc, "issues")

# #         range_result = _find_issue_range(doc, issue_number, tab_id)
# #         if not range_result:
# #             return {"error": f"Issue #{issue_number} not found"}

# #         start, end = range_result

# #         delete_req = {
# #             "deleteContentRange": {
# #                 "range": {"startIndex": start, "endIndex": end}
# #             }
# #         }
# #         if tab_id:
# #             delete_req["deleteContentRange"]["range"]["tabId"] = tab_id

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [delete_req]}
# #         ).execute()

# #         print(f"✓ Issue #{issue_number} resolved & removed")
# #         return {"issue_number": issue_number, "action": "resolved"}

# #     except Exception as e:
# #         return {"error": str(e)}

# def resolve_issue(issue_number, doc_id=None, tab_id: str = None):
#     """Issue ko poora remove karo doc se (resolve = delete)."""
#     if not doc_id:
#         return {"error": "No Google Doc ID provided"}
#     try:
#         service = get_docs_service()
#         doc     = get_document(doc_id)

#         if not tab_id:
#             tab_id = _get_tab_id(doc, "issues")

#         range_result = _find_issue_range(doc, issue_number, tab_id)
#         if not range_result:
#             return {"error": f"Issue #{issue_number} not found"}

#         start, end = range_result

#         # Google Docs restriction: last segment ka final newline
#         # akela delete nahi ho sakta — isliye end ko 1 peeche karo
#         safe_end = end - 1
#         if safe_end <= start:
#             safe_end = end

#         delete_req = {
#             "deleteContentRange": {
#                 "range": {"startIndex": start, "endIndex": safe_end}
#             }
#         }
#         if tab_id:
#             delete_req["deleteContentRange"]["range"]["tabId"] = tab_id

#         service.documents().batchUpdate(
#             documentId=doc_id,
#             body={"requests": [delete_req]}
#         ).execute()

#         print(f"✓ Issue #{issue_number} resolved & removed")
#         return {"issue_number": issue_number, "action": "resolved"}

#     except Exception as e:
#         return {"error": str(e)}
    
# # def resolve_issue(issue_number, doc_id=None, tab_id: str = None):
# #     """Status ko RESOLVED karo — issue delete nahi hoga."""
# #     if not doc_id:
# #         return {"error": "No Google Doc ID provided"}
# #     try:
# #         service = get_docs_service()
# #         doc     = get_document(doc_id)

# #         if not tab_id:
# #             tab_id = _get_tab_id(doc, "issues")

# #         rng = _find_status_range(doc, issue_number, tab_id)
# #         if not rng:
# #             return {"error": f"Issue #{issue_number} status tag not found"}

# #         start, end = rng

# #         delete_req = {"deleteContentRange": {"range": {"startIndex": start, "endIndex": end}}}
# #         insert_req = {"insertText": {"location": {"index": start}, "text": "RESOLVED"}}

# #         if tab_id:
# #             delete_req["deleteContentRange"]["range"]["tabId"] = tab_id
# #             insert_req["insertText"]["location"]["tabId"] = tab_id

# #         service.documents().batchUpdate(
# #             documentId=doc_id,
# #             body={"requests": [delete_req, insert_req]}
# #         ).execute()

# #         print(f"✓ Issue #{issue_number} marked RESOLVED")
# #         return {"issue_number": issue_number, "action": "resolved"}

# #     except Exception as e:
# #         return {"error": str(e)}
# # def resolve_issue(issue_number, doc_id=None):
# #     return update_issue_status(issue_number, "RESOLVED", doc_id)


# def delete_issue(issue_number, doc_id=None):
#     if not doc_id:
#         return {"error": "No Google Doc ID provided"}
#     try:
#         service      = get_docs_service()
#         doc          = get_document(doc_id)
#         range_result = _find_issue_range(doc, issue_number)
#         if not range_result:
#             return {"error": f"Issue #{issue_number} not found"}

#         start, end = range_result
#         safe_end   = end - 1
#         if safe_end <= start:
#             safe_end = end

#         service.documents().batchUpdate(
#             documentId=doc_id,
#             body={"requests": [{"deleteContentRange": {
#                 "range": {
#                     "startIndex": start - 1 if start > 1 else start,
#                     "endIndex":   safe_end
#                 }
#             }}]}
#         ).execute()

#         _renumber_issues(doc_id)
#         return {"issue_number": issue_number, "action": "deleted"}
#     except Exception as e:
#         return {"error": str(e)}


# def _renumber_issues(doc_id: str):
#     try:
#         service   = get_docs_service()
#         doc       = get_document(doc_id)
#         requests  = []
#         new_number = 1

#         for block in doc.get("body", {}).get("content", []):
#             para      = block.get("paragraph", {})
#             full_text = ""
#             for elem in para.get("elements", []):
#                 full_text += elem.get("textRun", {}).get("content", "")

#             match = re.match(r"^(\d+)\.", full_text.strip())
#             if match:
#                 old_number = match.group(1)
#                 if old_number != str(new_number):
#                     requests.append({
#                         "replaceAllText": {
#                             "containsText": {"text": f"\n{old_number}.", "matchCase": True},
#                             "replaceText":  f"\n{new_number}."
#                         }
#                     })
#                 new_number += 1

#         if requests:
#             service.documents().batchUpdate(
#                 documentId=doc_id,
#                 body={"requests": requests}
#             ).execute()
#     except Exception as e:
#         print(f"Renumber error: {e}")


# # def get_all_issues(doc_id=None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc  = get_document(doc_id)
# #         text = _get_doc_text(doc)
# #         issues = []

# #         pattern = re.compile(
# #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# #             r"Title:\s*(.+?)\s*\n"
# #             r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)\s{2,}Created On:\s*(.+?)(?=\n─|\nIssue #|\Z)",
# #             re.DOTALL
# #         )

# #         status_map = {
# #             "open":        "open",
# #             "in progress": "in_progress",
# #             "in_progress": "in_progress",
# #             "testing":     "testing",
# #             "blocked":     "blocked",
# #             "resolved":    "resolved",
# #             "closed":      "closed",
# #         }

# #         for match in pattern.finditer(text):
# #             number   = int(match.group(1))
# #             title    = match.group(2).strip()
# #             status   = match.group(3).strip().lower()
# #             priority = match.group(4).strip().lower()
# #             created  = match.group(5).strip().split("\n")[0].strip()

# #             if not title:
# #                 continue

# #             issues.append({
# #                 "number":   number,
# #                 "title":    title,
# #                 "status":   status_map.get(status, "open"),
# #                 "priority": priority,
# #                 "created":  created,
# #             })

# #         print(f"✓ Found {len(issues)} issues")
# #         return issues

# #     except Exception as e:
# #         print(f"Doc fetch error: {e}")
# #         return []



# # def get_all_issues(doc_id=None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc  = get_document(doc_id)
# #         text = _get_doc_text(doc)
# #         print(f"Doc text preview:\n{text[:500]}")
# #         issues = []
# # def get_all_issues(doc_id=None, tab_id: str = None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc = get_document(doc_id)
        
# #         # Auto-detect issues tab
# #         if not tab_id:
# #             tab_id = _get_tab_id(doc, "issues")
        
# #         text = _get_doc_text(doc, tab_id)
# #         print(f"Reading from tab: {tab_id}")
# #         print(f"Doc text preview:\n{text[:300]}")
# #         # ── Format 1: "Issue #5 [MODULE]" naya format ──
# #         pattern1 = re.compile(
# #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# #             r"Title:\s*(.+?)\s*\n"
# #             r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)",
# #             re.DOTALL
# #         )
# #         for m in pattern1.finditer(text):
# #             issues.append({
# #                 "number":   int(m.group(1)),
# #                 "title":    m.group(2).strip(),
# #                 "status":   _normalize_status(m.group(3).strip()),
# #                 "priority": m.group(4).strip().lower(),
# #                 "created":  "",
# #             })

# #         # ── Format 2: "1. TITLE" purana format ──
# #         if not issues:
# #             pattern2 = re.compile(r"^\s*(\d+)\.\s+(.+?)$", re.MULTILINE)
# #             for m in pattern2.finditer(text):
# #                 title = m.group(2).strip()
# #                 if title and len(title) > 2:
# #                     issues.append({
# #                         "number":   int(m.group(1)),
# #                         "title":    title[:100],
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })

# #         # ── Format 3: Heading/bold lines — koi bhi numbered list ──
# #         if not issues:
# #             pattern3 = re.compile(r"(?:^|\n)(\d+)[.)]\s+(.{5,100})", re.MULTILINE)
# #             for m in pattern3.finditer(text):
# #                 title = m.group(2).strip()
# #                 if title:
# #                     issues.append({
# #                         "number":   int(m.group(1)),
# #                         "title":    title[:100],
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })

# #         # ── Format 4: "Bug:", "Issue:", "Feature:" prefix wale ──
# #         if not issues:
# #             pattern4 = re.compile(
# #                 r"(?:Bug|Issue|Feature|Task|Problem)[:\s#]*(\d*)[:\s]+(.{5,150})",
# #                 re.IGNORECASE
# #             )
# #             count = 1
# #             for m in pattern4.finditer(text):
# #                 num = int(m.group(1)) if m.group(1) else count
# #                 title = m.group(2).strip()[:100]
# #                 if title:
# #                     issues.append({
# #                         "number":   num,
# #                         "title":    title,
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })
# #                     count += 1

# #         # Duplicates remove karo
# #         seen = set()
# #         unique_issues = []
# #         for issue in issues:
# #             if issue["number"] not in seen:
# #                 seen.add(issue["number"])
# #                 unique_issues.append(issue)

# #         print(f"✓ Found {len(unique_issues)} issues")
# #         return unique_issues

# #     except Exception as e:
# #         print(f"Doc fetch error: {e}")
# #         return []


# # def _normalize_status(status: str) -> str:
# #     status = status.lower().strip()
# #     mapping = {
# #         "open":        "open",
# #         "in progress": "in_progress",
# #         "in_progress": "in_progress",
# #         "inprogress":  "in_progress",
# #         "testing":     "testing",
# #         "blocked":     "blocked",
# #         "resolved":    "resolved",
# #         "closed":      "closed",
# #         "done":        "resolved",
# #         "fixed":       "resolved",
# #         "complete":    "closed",
# #         "completed":   "closed",
# #     }
# #     return mapping.get(status, "open")


# # def get_all_issues(doc_id=None, tab_id: str = None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc = get_document(doc_id)
# #         all_text = ""
# #         tabs = doc.get("tabs", [])

# #         if tabs:
# #             target_tab = None

# #             # 1. Pehle "ISSUES" naam ka tab dhundo
# #             for tab in tabs:
# #                 props = tab.get("tabProperties", {})
# #                 title = props.get("title", "").strip().lower()
# #                 if title == "issues" or title == "issue":
# #                     target_tab = tab
# #                     break

# #             # 2. tab_id se match karo
# #             if not target_tab and tab_id:
# #                 for tab in tabs:
# #                     props = tab.get("tabProperties", {})
# #                     if props.get("tabId") == tab_id:
# #                         target_tab = tab
# #                         break

# #             # 3. Fallback — pehla tab
# #             if not target_tab:
# #                 target_tab = tabs[0]

# #             tab_title = target_tab.get("tabProperties", {}).get("title", "Unknown")
# #             print(f"Reading from tab: '{tab_title}'")

# #             # Sirf is tab ka text lo
# #             doc_tab = target_tab.get("documentTab", {})
# #             content = doc_tab.get("body", {}).get("content", [])
# #             for block in content:
# #                 for elem in block.get("paragraph", {}).get("elements", []):
# #                     all_text += elem.get("textRun", {}).get("content", "")

# #             # Child tabs bhi is tab ke under hain toh lo
# #             for child in target_tab.get("childTabs", []):
# #                 child_content = child.get("documentTab", {}).get("body", {}).get("content", [])
# #                 for block in child_content:
# #                     for elem in block.get("paragraph", {}).get("elements", []):
# #                         all_text += elem.get("textRun", {}).get("content", "")
# #         else:
# #             all_text = _get_doc_text(doc)

# #         print(f"Text preview:\n{all_text[:300]}")

# #         result = []

# #         # Format 1: "Issue #5 [MODULE]" naya format
# #         pattern1 = re.compile(
# #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# #             r"Title:\s*(.+?)\s*\n"
# #             r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)\s{2,}Created On:\s*(.+?)(?=\n─|\nIssue #|\Z)",
# #             re.DOTALL
# #         )
# #         for m in pattern1.finditer(all_text):
# #             result.append({
# #                 "number":   int(m.group(1)),
# #                 "title":    m.group(2).strip(),
# #                 "status":   _normalize_status(m.group(3).strip()),
# #                 "priority": m.group(4).strip().lower(),
# #                 "created":  m.group(5).strip().split("\n")[0].strip(),
# #             })

# #         # Format 2: "1. TITLE\n   ISSUE: desc"
# #         if not result:
# #             pattern2 = re.compile(
# #                 r"(\d+)\.\s+(.+?)\n\s+(?:ISSUE|FEATURE):\s+(.+?)(?=\n\d+\.|\Z)",
# #                 re.DOTALL
# #             )
# #             for m in pattern2.finditer(all_text):
# #                 title = m.group(2).strip()
# #                 if title:
# #                     result.append({
# #                         "number":   int(m.group(1)),
# #                         "title":    title[:100],
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })

# #         # Format 3: simple numbered list
# #         if not result:
# #             pattern3 = re.compile(r"^\s*(\d+)[.)]\s+(.{5,150})$", re.MULTILINE)
# #             for m in pattern3.finditer(all_text):
# #                 title = m.group(2).strip()
# #                 if title and not title.upper().startswith("ISSUE:") and not title.upper().startswith("UPDATE:"):
# #                     result.append({
# #                         "number":   int(m.group(1)),
# #                         "title":    title[:100],
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })

# #         # Duplicates remove
# #         seen = set()
# #         unique = []
# #         for issue in result:
# #             if issue["number"] not in seen:
# #                 seen.add(issue["number"])
# #                 unique.append(issue)

# #         print(f"✓ Found {len(unique)} issues")
# #         return unique

# #     except Exception as e:
# #         print(f"Doc fetch error: {e}")
# #         return []
# # def _normalize_status(status: str) -> str:
# #     status = status.lower().strip()
# #     mapping = {
# #         "open":        "open",
# #         "in progress": "in_progress",
# #         "in_progress": "in_progress",
# #         "inprogress":  "in_progress",
# #         "testing":     "testing",
# #         "blocked":     "blocked",
# #         "resolved":    "resolved",
# #         "closed":      "closed",
# #         "done":        "resolved",
# #         "fixed":       "resolved",
# #         "complete":    "closed",
# #         "completed":   "closed",
# #     }
# #     return mapping.get(status, "open")
# # def get_all_issues(doc_id=None, tab_id: str = None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc = get_document(doc_id)
# #         all_text = ""

# #         # Tabs hain toh saare tabs ka text nikalo
# #         tabs = doc.get("tabs", [])
# #         if tabs:
# #             for tab in tabs:
# #                 doc_tab = tab.get("documentTab", {})
# #                 content = doc_tab.get("body", {}).get("content", [])
# #                 for block in content:
# #                     for elem in block.get("paragraph", {}).get("elements", []):
# #                         all_text += elem.get("textRun", {}).get("content", "")
# #                 # Child tabs bhi
# #                 for child in tab.get("childTabs", []):
# #                     child_content = child.get("documentTab", {}).get("body", {}).get("content", [])
# #                     for block in child_content:
# #                         for elem in block.get("paragraph", {}).get("elements", []):
# #                             all_text += elem.get("textRun", {}).get("content", "")
# #         else:
# #             # No tabs — regular doc
# #             all_text = _get_doc_text(doc)

# #         print(f"Total text length: {len(all_text)}")
# #         print(f"Text preview:\n{all_text[:400]}")

# #         issues = []

# #         # Format 1: "Issue #5 [MODULE]" naya format
# #         pattern1 = re.compile(
# #             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
# #             r"Title:\s*(.+?)\s*\n"
# #             r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)\s{2,}Created On:\s*(.+?)(?=\n─|\nIssue #|\Z)",
# #             re.DOTALL
# #         )
# #         for m in pattern1.finditer(all_text):
# #             issues.append({
# #                 "number":   int(m.group(1)),
# #                 "title":    m.group(2).strip(),
# #                 "status":   _normalize_status(m.group(3).strip()),
# #                 "priority": m.group(4).strip().lower(),
# #                 "created":  m.group(5).strip().split("\n")[0].strip(),
# #             })

# #         # Format 2: "1. TITLE" purana format
# #         if not issues:
# #             pattern2 = re.compile(r"^\s*(\d+)\.\s+(.+?)$", re.MULTILINE)
# #             for m in pattern2.finditer(all_text):
# #                 title = m.group(2).strip()
# #                 if title and len(title) > 2:
# #                     issues.append({
# #                         "number":   int(m.group(1)),
# #                         "title":    title[:100],
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })

# #         # Format 3: koi bhi numbered list
# #         if not issues:
# #             pattern3 = re.compile(r"(?:^|\n)(\d+)[.)]\s+(.{5,100})", re.MULTILINE)
# #             for m in pattern3.finditer(all_text):
# #                 title = m.group(2).strip()
# #                 if title:
# #                     issues.append({
# #                         "number":   int(m.group(1)),
# #                         "title":    title[:100],
# #                         "status":   "open",
# #                         "priority": "medium",
# #                         "created":  "",
# #                     })

# #         # Duplicates remove
# #         seen = set()
# #         unique = []
# #         for issue in issues:
# #             if issue["number"] not in seen:
# #                 seen.add(issue["number"])
# #                 unique.append(issue)

# #         print(f"✓ Found {len(unique)} issues")
# #         return unique

# #     except Exception as e:
# #         print(f"Doc fetch error: {e}")
# #         return []
# def get_all_issues(doc_id=None, tab_id: str = None):
#     if not doc_id:
#         return []
#     try:
#         doc = get_document(doc_id)
#         all_text = ""
#         tabs = doc.get("tabs", [])

#         if tabs:
#             target_tab = None

#             if tab_id:
#                 for tab in tabs:
#                     props = tab.get("tabProperties", {})
#                     if props.get("tabId") == tab_id:
#                         target_tab = tab
#                         break
#                     for child in tab.get("childTabs", []):
#                         if child.get("tabProperties", {}).get("tabId") == tab_id:
#                             target_tab = child
#                             break

#             if not target_tab:
#                 for tab in tabs:
#                     props = tab.get("tabProperties", {})
#                     title = props.get("title", "").strip().upper()
#                     if "ISSUE" in title:
#                         target_tab = tab
#                         break

#             if not target_tab:
#                 target_tab = tabs[0]

#             tab_title = target_tab.get("tabProperties", {}).get("title", "Unknown")
#             print(f"Reading from tab: '{tab_title}'")

#             doc_tab = target_tab.get("documentTab", {})
#             content = doc_tab.get("body", {}).get("content", [])
#             for block in content:
#                 for elem in block.get("paragraph", {}).get("elements", []):
#                     all_text += elem.get("textRun", {}).get("content", "")

#             for child in target_tab.get("childTabs", []):
#                 child_content = child.get("documentTab", {}).get("body", {}).get("content", [])
#                 for block in child_content:
#                     for elem in block.get("paragraph", {}).get("elements", []):
#                         all_text += elem.get("textRun", {}).get("content", "")
#         else:
#             all_text = _get_doc_text(doc)

#         print(f"Text preview:\n{all_text[:300]}")

#         result = []
#         seen = set()
#         pattern0 = re.compile(r"^(\d+)\.\s+(.+?)\s*\[STATUS:\s*(\w+)\]\s*$", re.MULTILINE)
#         for m in pattern0.finditer(all_text):
#             num = int(m.group(1))
#             if num not in seen:
#                 seen.add(num)
#                 result.append({
#                     "number":   num,
#                     "title":    m.group(2).strip(),
#                     "status":   _normalize_status(m.group(3).strip()),
#                     "priority": "medium",
#                     "created":  "",
#                 })

#         # ── Format 1: Naya format "Issue #12 [MODULE]\nTitle: ...\nStatus: ..." ──
#         pattern1 = re.compile(
#             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
#             r"Title:\s*(.+?)\s*\n"
#             r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)\s{2,}Created On:\s*(.+?)(?=\n─|\n═|\nIssue #|\Z)",
#             re.DOTALL
#         )
#         for m in pattern1.finditer(all_text):
#             num = int(m.group(1))
#             if num not in seen:
#                 seen.add(num)
#                 result.append({
#                     "number":   num,
#                     "title":    m.group(2).strip(),
#                     "status":   _normalize_status(m.group(3).strip()),
#                     "priority": m.group(4).strip().lower(),
#                     "created":  m.group(5).strip().split("\n")[0].strip(),
#                 })

#         # ── Format 2: Naya format without Status line ──
#         pattern1b = re.compile(
#             r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
#             r"Title:\s*(.+?)\s*\n",
#             re.DOTALL
#         )
#         for m in pattern1b.finditer(all_text):
#             num = int(m.group(1))
#             if num not in seen:
#                 seen.add(num)
#                 result.append({
#                     "number":   num,
#                     "title":    m.group(2).strip(),
#                     "status":   "open",
#                     "priority": "medium",
#                     "created":  "",
#                 })

#         # ── Format 3: Bold numbered "12. TITLE IN CAPS" ──
#         # pattern2 = re.compile(
#         #     r"(\d+)\.\s+([A-Z][A-Z\s\-\/&,()]{3,})\n",
#         #     re.MULTILINE
#         # )
#         # for m in pattern2.finditer(all_text):
#         #     num = int(m.group(1))
#         #     title = m.group(2).strip()
#         #     if num not in seen and title and len(title) > 3:
#         #         seen.add(num)
#         #         result.append({
#         #             "number":   num,
#         #             "title":    title[:100],
#         #             "status":   "open",
#         #             "priority": "medium",
#         #             "created":  "",
#         #         })
#         # ── Format 3: "12. TITLE" — ALL CAPS ya mixed case dono ──
#         pattern2 = re.compile(
#             r"^(\d+)\.\s+(.{5,200})$",
#             re.MULTILINE
#         )
#         for m in pattern2.finditer(all_text):
#             num = int(m.group(1))
#             title = m.group(2).strip()
#             if num not in seen and title:
#                 # Skip karo agar yeh metadata lines hain
#                 skip_words = ["ISSUE:", "UPDATE:", "TYPE:", "STATUS:", "DESCRIPTION:", 
#                             "NOTE:", "Title:", "Type:", "Priority:", "Created"]
#                 if not any(title.startswith(skip) for skip in skip_words):
#                     seen.add(num)
#                     result.append({
#                         "number":   num,
#                         "title":    title[:100],
#                         "status":   "open",
#                         "priority": "medium",
#                         "created":  "",
#                     })

#         # ── Format 4: Any numbered list fallback ──
#         pattern3 = re.compile(r"^\s*(\d+)[.)]\s+(.{5,150})$", re.MULTILINE)
#         for m in pattern3.finditer(all_text):
#             num = int(m.group(1))
#             title = m.group(2).strip()
#             if num not in seen and title:
#                 if not any(skip in title.upper() for skip in ["ISSUE:", "UPDATE:", "TYPE:", "STATUS:", "DESCRIPTION:", "NOTE:"]):
#                     seen.add(num)
#                     result.append({
#                         "number":   num,
#                         "title":    title[:100],
#                         "status":   "open",
#                         "priority": "medium",
#                         "created":  "",
#                     })

#         # Sort by number
#         result.sort(key=lambda x: x["number"])
#         print(f"✓ Found {len(result)} issues")
#         return result

#     except Exception as e:
#         print(f"Doc fetch error: {e}")
#         return []
# def _normalize_status(status: str) -> str:
#     status = status.lower().strip()
#     mapping = {
#         "open":        "open",
#         "in progress": "in_progress",
#         "in_progress": "in_progress",
#         "inprogress":  "in_progress",
#         "testing":     "testing",
#         "blocked":     "blocked",
#         "resolved":    "resolved",
#         "closed":      "closed",
#         "done":        "resolved",
#         "fixed":       "resolved",
#         "complete":    "closed",
#         "completed":   "closed",
#     }
#     return mapping.get(status, "open") 

# def search_docs(query: str = "") -> list:
#     try:
#         service = get_drive_service()
#         q = "mimeType='application/vnd.google-apps.document' and trashed=false"
#         if query:
#             q += f" and name contains '{query}'"
#         results = service.files().list(
#             q=q, pageSize=10,
#             fields="files(id, name, modifiedTime, webViewLink)"
#         ).execute()
#         return results.get("files", [])
#     except Exception as e:
#         print(f"Drive search error: {e}")
#         return []


# def create_new_doc(title: str) -> dict:
#     try:
#         service = get_docs_service()
#         doc     = service.documents().create(body={"title": title}).execute()
#         doc_id  = doc["documentId"]
#         return {
#             "id":          doc_id,
#             "name":        title,
#             "webViewLink": f"https://docs.google.com/document/d/{doc_id}/edit"
#         }
#     except Exception as e:
#         return {"error": str(e)}



import os
import re
import json
from datetime import date
from dotenv import load_dotenv
from functools import lru_cache
from google.oauth2 import service_account
from googleapiclient.discovery import build

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]


# ─── Credentials & Services ───────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_credentials():
    creds_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if creds_json:
        creds_dict = json.loads(creds_json)
        return service_account.Credentials.from_service_account_info(
            creds_dict, scopes=SCOPES
        )
    creds_path = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials/google_service_account.json")
    return service_account.Credentials.from_service_account_file(
        creds_path, scopes=SCOPES
    )


@lru_cache(maxsize=1)
def get_docs_service():
    return build("docs", "v1", credentials=get_credentials())


@lru_cache(maxsize=1)
def get_drive_service():
    return build("drive", "v3", credentials=get_credentials())


# ─── Document Fetching ────────────────────────────────────────────────────────

def get_document(doc_id: str, tab_id: str = None):
    service = get_docs_service()
    return service.documents().get(
        documentId=doc_id,
        includeTabsContent=True
    ).execute()


# ─── Tab Helpers ──────────────────────────────────────────────────────────────

def _get_tab_content(doc, tab_id: str = None):
    tabs = doc.get("tabs", [])

    if not tabs:
        return doc.get("body", {}).get("content", [])

    if tab_id:
        for tab in tabs:
            if tab.get("tabProperties", {}).get("tabId") == tab_id:
                return tab.get("documentTab", {}).get("body", {}).get("content", [])
            for child in tab.get("childTabs", []):
                if child.get("tabProperties", {}).get("tabId") == tab_id:
                    return child.get("documentTab", {}).get("body", {}).get("content", [])

    for tab in tabs:
        if "issue" in tab.get("tabProperties", {}).get("title", "").lower():
            return tab.get("documentTab", {}).get("body", {}).get("content", [])

    return tabs[0].get("documentTab", {}).get("body", {}).get("content", [])


def _get_tab_id(doc, tab_name: str = "issues") -> str | None:
    for tab in doc.get("tabs", []):
        props = tab.get("tabProperties", {})
        if tab_name.lower() in props.get("title", "").lower():
            return props.get("tabId")
    return None


def _get_doc_text(doc, tab_id: str = None) -> str:
    content = _get_tab_content(doc, tab_id)
    text = ""
    for block in content:
        for elem in block.get("paragraph", {}).get("elements", []):
            text += elem.get("textRun", {}).get("content", "")
    return text


def _get_last_issue_number(doc, tab_id: str = None) -> int:
    """Saare tabs mein se highest issue number nikalo — global numbering."""
    all_text = ""
    tabs = doc.get("tabs", [])

    if tabs:
        for tab in tabs:
            content = tab.get("documentTab", {}).get("body", {}).get("content", [])
            for block in content:
                for elem in block.get("paragraph", {}).get("elements", []):
                    all_text += elem.get("textRun", {}).get("content", "")
            for child in tab.get("childTabs", []):
                content = child.get("documentTab", {}).get("body", {}).get("content", [])
                for block in content:
                    for elem in block.get("paragraph", {}).get("elements", []):
                        all_text += elem.get("textRun", {}).get("content", "")
    else:
        all_text = _get_doc_text(doc)

    new_fmt = re.findall(r"Issue #(\d+)", all_text)
    old_fmt = re.findall(r"^\s*(\d+)\.", all_text, re.MULTILINE)
    all_nums = [int(n) for n in new_fmt + old_fmt]
    return max(all_nums, default=0)


def _normalize_status(status: str) -> str:
    mapping = {
        "open":        "open",
        "in progress": "in_progress",
        "in_progress": "in_progress",
        "inprogress":  "in_progress",
        "testing":     "testing",
        "blocked":     "blocked",
        "resolved":    "resolved",
        "closed":      "closed",
        "done":        "resolved",
        "fixed":       "resolved",
        "complete":    "closed",
        "completed":   "closed",
    }
    return mapping.get(status.lower().strip(), "open")


# ─── Issue Range Finder ───────────────────────────────────────────────────────

def _find_issue_range(doc, issue_number: int, tab_id: str = None):
    content = _get_tab_content(doc, tab_id)
    start = None
    end   = None

    for block in content:
        full_text = "".join(
            e.get("textRun", {}).get("content", "")
            for e in block.get("paragraph", {}).get("elements", [])
        )
        block_start = block.get("startIndex")
        block_end   = block.get("endIndex")

        this_issue = re.match(rf"^\s*{issue_number}\.\s+", full_text)
        any_issue  = re.match(r"^\s*\d+\.\s+", full_text)

        if this_issue and start is None:
            start = block_start
        elif start is not None and any_issue:
            end = block_start
            break

    if start is not None and end is None and content:
        end = content[-1].get("endIndex", start)

    return (start, end) if start is not None else None


def _find_status_position(doc, issue_number: int):
    text = _get_doc_text(doc)
    pattern = re.compile(
        rf"(Issue #{issue_number}(?:\s*\[[^\]]*\])?.*?)(Status:\s*\w[\w ]*?)(\s+Priority:)",
        re.DOTALL
    )
    match = pattern.search(text)
    if not match:
        return None, None

    status_start_char = match.start(2)
    status_end_char   = match.end(2)
    char_count        = 0
    start_index       = None
    end_index         = None

    for block in doc.get("body", {}).get("content", []):
        for elem in block.get("paragraph", {}).get("elements", []):
            content    = elem.get("textRun", {}).get("content", "")
            elem_start = elem.get("startIndex", 0)
            for i, ch in enumerate(content):
                if char_count == status_start_char:
                    start_index = elem_start + i
                if char_count == status_end_char:
                    end_index = elem_start + i
                char_count += 1

    return start_index, end_index


# ─── CRUD Operations ──────────────────────────────────────────────────────────

def create_issue(title, description, issue_type="issue", module=None,
                 note=None, doc_id=None, observations=None,
                 priority="medium", status="open", tab_id: str = None):
    if not doc_id:
        return {"error": "No Google Doc ID provided"}
    try:
        service     = get_docs_service()
        doc         = get_document(doc_id)
        next_number = _get_last_issue_number(doc) + 1
        content     = _get_tab_content(doc, tab_id)
        last_elem   = content[-1] if content else None
        insert_idx  = last_elem.get("endIndex", 1) - 1 if last_elem else 1

        module_tag   = f" [{module.upper()}]" if module else ""
        priority_str = (priority or "medium").upper()

        obs_text  = ""
        if observations:
            obs_text = "\n" + "\n".join([f"• {o}" for o in observations])

        note_text = f"\n~ {note}" if note else ""

        title_line = f"\n{next_number}. {title.upper()}\n"
        desc_line  = f"{description}{obs_text}{note_text}\n"
        full_text  = title_line + desc_line

        title_start = insert_idx + 1
        title_end   = title_start + len(title_line.strip())

        insert_req = {
            "insertText": {
                "location": {"index": insert_idx},
                "text": full_text
            }
        }
        bold_req = {
            "updateTextStyle": {
                "range": {"startIndex": title_start, "endIndex": title_end},
                "textStyle": {"bold": True},
                "fields": "bold"
            }
        }

        if tab_id:
            insert_req["insertText"]["location"]["tabId"] = tab_id
            bold_req["updateTextStyle"]["range"]["tabId"] = tab_id

        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [insert_req, bold_req]}
        ).execute()

        print(f"✓ Issue #{next_number} added")
        return {"issue_number": next_number, "title": title, "action": "created"}

    except Exception as e:
        return {"error": str(e)}
    
def resolve_issue(issue_number, doc_id=None, tab_id: str = None):
    """Status ko RESOLVED karo — issue delete nahi hoga."""
    if not doc_id:
        return {"error": "No Google Doc ID provided"}
    try:
        service = get_docs_service()
        doc     = get_document(doc_id)

        if not tab_id:
            tab_id = _get_tab_id(doc, "issues")

        rng = _find_status_range(doc, issue_number, tab_id)
        if not rng:
            return {"error": f"Issue #{issue_number} status tag not found"}

        start, end = rng

        delete_req = {"deleteContentRange": {"range": {"startIndex": start, "endIndex": end}}}
        insert_req = {"insertText": {"location": {"index": start}, "text": "RESOLVED"}}

        if tab_id:
            delete_req["deleteContentRange"]["range"]["tabId"] = tab_id
            insert_req["insertText"]["location"]["tabId"] = tab_id

        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [delete_req, insert_req]}
        ).execute()

        print(f"✓ Issue #{issue_number} marked RESOLVED")
        return {"issue_number": issue_number, "action": "resolved"}

    except Exception as e:
        return {"error": str(e)}

def update_issue(issue_number, new_description, doc_id=None, tab_id=None):
    if not doc_id:
        return {"error": "No Google Doc ID provided"}
    try:
        service      = get_docs_service()
        doc          = get_document(doc_id)
        range_result = _find_issue_range(doc, issue_number, tab_id)
        if not range_result:
            return {"error": f"Issue #{issue_number} not found"}

        _, end_index = range_result
        insert_at    = max(end_index - 1, 1)

        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{"insertText": {
                "location": {"index": insert_at},
                "text": f"\nUPDATE: {new_description}"
            }}]}
        ).execute()
        return {"issue_number": issue_number, "action": "updated"}

    except Exception as e:
        return {"error": str(e)}




# def resolve_issue(issue_number, doc_id=None, tab_id: str = None):
#     """Issue ko doc se delete karo."""
#     if not doc_id:
#         return {"error": "No Google Doc ID provided"}
#     try:
#         service      = get_docs_service()
#         doc          = get_document(doc_id)
#         range_result = _find_issue_range(doc, issue_number, tab_id)
#         if not range_result:
#             return {"error": f"Issue #{issue_number} not found"}

#         start, end = range_result
#         safe_end   = max(end - 1, start + 1)

#         delete_req = {
#             "deleteContentRange": {
#                 "range": {"startIndex": start, "endIndex": safe_end}
#             }
#         }
#         if tab_id:
#             delete_req["deleteContentRange"]["range"]["tabId"] = tab_id

#         service.documents().batchUpdate(
#             documentId=doc_id,
#             body={"requests": [delete_req]}
#         ).execute()

#         print(f"✓ Issue #{issue_number} resolved & removed")
#         return {"issue_number": issue_number, "action": "resolved"}

#     except Exception as e:
#         return {"error": str(e)}


def delete_issue(issue_number, doc_id=None, tab_id=None):
    return resolve_issue(issue_number, doc_id, tab_id)


# ─── Get All Issues ───────────────────────────────────────────────────────────

def get_all_issues(doc_id=None, tab_id: str = None):
    if not doc_id:
        return []
    try:
        doc      = get_document(doc_id)
        all_text = ""
        tabs     = doc.get("tabs", [])

        if tabs:
            target_tab = None

            if tab_id:
                for tab in tabs:
                    if tab.get("tabProperties", {}).get("tabId") == tab_id:
                        target_tab = tab
                        break
                    for child in tab.get("childTabs", []):
                        if child.get("tabProperties", {}).get("tabId") == tab_id:
                            target_tab = child
                            break

            if not target_tab:
                for tab in tabs:
                    if "ISSUE" in tab.get("tabProperties", {}).get("title", "").upper():
                        target_tab = tab
                        break

            if not target_tab:
                target_tab = tabs[0]

            print(f"Reading from tab: '{target_tab.get('tabProperties', {}).get('title', 'Unknown')}'")

            content = target_tab.get("documentTab", {}).get("body", {}).get("content", [])
            for block in content:
                for elem in block.get("paragraph", {}).get("elements", []):
                    all_text += elem.get("textRun", {}).get("content", "")

            for child in target_tab.get("childTabs", []):
                for block in child.get("documentTab", {}).get("body", {}).get("content", []):
                    for elem in block.get("paragraph", {}).get("elements", []):
                        all_text += elem.get("textRun", {}).get("content", "")
        else:
            all_text = _get_doc_text(doc)

        print(f"Text preview:\n{all_text[:300]}")

        result = []
        seen   = set()

        # Format 1: "Issue #5 [MODULE]\nTitle: ...\nStatus: ..."
        p1 = re.compile(
            r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
            r"Title:\s*(.+?)\s*\n"
            r".*?Status:\s*([\w ]+?)\s{2,}Priority:\s*(\w+)\s{2,}Created On:\s*(.+?)(?=\n─|\n═|\nIssue #|\Z)",
            re.DOTALL
        )
        for m in p1.finditer(all_text):
            num = int(m.group(1))
            if num not in seen:
                seen.add(num)
                result.append({
                    "number":   num,
                    "title":    m.group(2).strip(),
                    "status":   _normalize_status(m.group(3)),
                    "priority": m.group(4).strip().lower(),
                    "created":  m.group(5).strip().split("\n")[0].strip(),
                })

        # Format 2: "Issue #5\nTitle: ..." without Status
        p2 = re.compile(
            r"Issue #(\d+)(?:\s*\[[^\]]*\])?\s*\n"
            r"Title:\s*(.+?)\s*\n",
            re.DOTALL
        )
        for m in p2.finditer(all_text):
            num = int(m.group(1))
            if num not in seen:
                seen.add(num)
                result.append({
                    "number":   num,
                    "title":    m.group(2).strip(),
                    "status":   "open",
                    "priority": "medium",
                    "created":  "",
                })

        # Format 3: "12. TITLE" numbered list
        p3 = re.compile(r"^(\d+)\.\s+(.{5,200})$", re.MULTILINE)
        skip = ["ISSUE:", "UPDATE:", "TYPE:", "STATUS:", "DESCRIPTION:",
                "NOTE:", "Title:", "Type:", "Priority:", "Created"]
        for m in p3.finditer(all_text):
            num   = int(m.group(1))
            title = m.group(2).strip()
            if num not in seen and title:
                if not any(title.startswith(s) for s in skip):
                    seen.add(num)
                    result.append({
                        "number":   num,
                        "title":    title[:100],
                        "status":   "open",
                        "priority": "medium",
                        "created":  "",
                    })

        result.sort(key=lambda x: x["number"])
        print(f"✓ Found {len(result)} issues")
        return result

    except Exception as e:
        print(f"Doc fetch error: {e}")
        return []


# ─── Drive Helpers ────────────────────────────────────────────────────────────

def search_docs(query: str = "") -> list:
    try:
        service = get_drive_service()
        q = "mimeType='application/vnd.google-apps.document' and trashed=false"
        if query:
            q += f" and name contains '{query}'"
        results = service.files().list(
            q=q, pageSize=10,
            fields="files(id, name, modifiedTime, webViewLink)"
        ).execute()
        return results.get("files", [])
    except Exception as e:
        print(f"Drive search error: {e}")
        return []


def create_new_doc(title: str) -> dict:
    try:
        service = get_docs_service()
        doc     = service.documents().create(body={"title": title}).execute()
        doc_id  = doc["documentId"]
        return {
            "id":          doc_id,
            "name":        title,
            "webViewLink": f"https://docs.google.com/document/d/{doc_id}/edit"
        }
    except Exception as e:
        return {"error": str(e)}