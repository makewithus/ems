# # from fastapi import APIRouter
# # from pydantic import BaseModel
# # from typing import Optional
# # from fastapi import Query

# # from app.models.intent import IntentRequest
# # from app.services.intent_service import parse_intent
# # from app.services.gdocs_service import (
# #     create_issue, update_issue, resolve_issue,
# #     get_all_issues
# # )


# # router = APIRouter()
# # class CreateDocRequest(BaseModel):
# #     title: str


# # class ExecuteRequest(BaseModel):
# #     transcript: str
# #     confirmed: bool = False
# #     doc_id: Optional[str] = None


# # class PreviewResponse(BaseModel):
# #     success: bool
# #     confirmation_message: str
# #     action: str
# #     fields: dict
# #     needs_clarification: bool
# #     confidence: float
# #     error: Optional[str] = None


# # class ExecuteResponse(BaseModel):
# #     success: bool
# #     message: str
# #     result: Optional[dict] = None
# #     error: Optional[str] = None


# # @router.post("/preview", response_model=PreviewResponse)
# # def preview_action(request: ExecuteRequest):
# #     existing_issues = get_all_issues(doc_id=request.doc_id)

# #     intent_response = parse_intent(IntentRequest(
# #         transcript=request.transcript,
# #         existing_issues=existing_issues
# #     ))

# #     if not intent_response.success or not intent_response.intent:
# #         return PreviewResponse(
# #             success=False,
# #             confirmation_message="Could not understand. Please try again.",
# #             action="unknown",
# #             fields={},
# #             needs_clarification=True,
# #             confidence=0.0,
# #             error=intent_response.error
# #         )

# #     intent = intent_response.intent

# #     return PreviewResponse(
# #         success=True,
# #         confirmation_message=intent.confirmation_message,
# #         action=intent.action.value,
# #         fields=intent.fields.model_dump(exclude_none=True),
# #         needs_clarification=intent.needs_clarification,
# #         confidence=intent.confidence
# #     )


# # @router.post("/execute", response_model=ExecuteResponse)
# # def execute_action(request: ExecuteRequest):
# #     existing_issues = get_all_issues(doc_id=request.doc_id)

# #     intent_response = parse_intent(IntentRequest(
# #         transcript=request.transcript,
# #         existing_issues=existing_issues
# #     ))

# #     if not intent_response.success or not intent_response.intent:
# #         return ExecuteResponse(
# #             success=False,
# #             message="Intent could not be parsed",
# #             error=intent_response.error
# #         )

# #     intent = intent_response.intent
# #     fields = intent.fields
# #     action = intent.action.value

# #     # ── CREATE ────────────────────────────────────────────────────────────────
# #     if action == "create_issue":
# #         if not fields.title and not fields.description:
# #             return ExecuteResponse(
# #                 success=False,
# #                 message="Issue title or description is missing",
# #                 error="Incomplete fields"
# #             )

# #         result = create_issue(
# #         title=fields.title or fields.description[:60],
# #         description=fields.description or fields.title,
# #         issue_type=fields.issue_type.value if fields.issue_type else "issue",
# #         module=fields.module,
# #         note=fields.note,
# #         doc_id=request.doc_id,
# #         observations=fields.observations,      # ← add
# #         priority=fields.priority.value if fields.priority else "medium",  # ← add
# #         status=fields.status.value if fields.status else "open",          # ← add
# #     )

# #         if "error" in result:
# #             return ExecuteResponse(
# #                 success=False,
# #                 message=result["error"],
# #                 error=result["error"]
# #             )

# #         return ExecuteResponse(
# #             success=True,
# #             message=f"Issue #{result['issue_number']} added to doc ✓",
# #             result=result
# #         )

# #     # ── UPDATE ────────────────────────────────────────────────────────────────
# #     elif action == "update_issue":
# #         if not fields.issue_number:
# #             return ExecuteResponse(
# #                 success=False,
# #                 message="Which issue to update? Please mention the issue number.",
# #                 error="issue_number missing"
# #             )

# #         result = update_issue(
# #             issue_number=fields.issue_number,
# #             new_description=fields.description or "",
# #             doc_id=request.doc_id
# #         )

# #         if "error" in result:
# #             return ExecuteResponse(
# #                 success=False,
# #                 message=result["error"],
# #                 error=result["error"]
# #             )

# #         return ExecuteResponse(
# #             success=True,
# #             message=f"Issue #{fields.issue_number} updated ✓",
# #             result=result
# #         )

# #     # ── RESOLVE ───────────────────────────────────────────────────────────────
# #     elif action == "resolve_issue":
# #         if fields.issue_number:
# #             result = resolve_issue(
# #                 issue_number=fields.issue_number,
# #                 doc_id=request.doc_id
# #             )

# #             if "error" in result:
# #                 return ExecuteResponse(
# #                     success=False,
# #                     message=result["error"],
# #                     error=result["error"]
# #                 )

# #             return ExecuteResponse(
# #                 success=True,
# #                 message=f"Issue #{fields.issue_number} resolved ✓",
# #                 result=result
# #             )

# #         elif fields.issue_keyword or fields.module:
# #             keyword = (fields.issue_keyword or fields.module or "").lower()
# #             matched = None

# #             for issue in existing_issues:
# #                 if keyword in issue["title"].lower():
# #                     matched = issue
# #                     break

# #             if not matched:
# #                 return ExecuteResponse(
# #                     success=False,
# #                     message=f"No issue matched '{keyword}'. Please mention the issue number.",
# #                     error="No match found"
# #                 )

# #             result = resolve_issue(
# #                 issue_number=matched["number"],
# #                 doc_id=request.doc_id
# #             )

# #             return ExecuteResponse(
# #                 success=True,
# #                 message=f"Issue #{matched['number']} resolved ✓",
# #                 result=result
# #             )

# #         else:
# #             return ExecuteResponse(
# #                 success=False,
# #                 message="Which issue is resolved? Please mention the number or keyword.",
# #                 error="issue_number and issue_keyword both missing"
# #             )

# #     # ── UNKNOWN ───────────────────────────────────────────────────────────────
# #     else:
# #         return ExecuteResponse(
# #             success=False,
# #             message="Could not understand — try 'add issue', 'update issue', or 'resolved'",
# #             error="unknown action"
# #         )
    
# # @router.get("/docs/search")
# # def search_docs(q: str = ""):
# #     result = search_drive_docs(q)
# #     return result
# # def create_doc(request: CreateDocRequest):
# #     result = create_new_doc(request.title)
# #     return result

# # @router.get("/issues")
# # def get_issues(doc_id: str = ""):
# #     if not doc_id:
# #         return {"success": False, "error": "doc_id required"}
# #     issues = get_all_issues(doc_id=doc_id)
# #     return {"success": True, "issues": issues}

# # def get_all_issues(doc_id=None):
# #     if not doc_id:
# #         return []
# #     try:
# #         doc  = get_document(doc_id)
# #         text = _get_doc_text(doc)
# #         issues = []

# #         for match in re.finditer(
# #             r"Issue #(\d+).*?\nTitle:\s*(.+?)\n.*?Status:\s*(\w[\w ]*?)\s+Priority:\s*(\w+)\s+Created On:\s*(.+?)(?=\nIssue #|\Z)",
# #             text, re.DOTALL
# #         ):
# #             number   = int(match.group(1))
# #             title    = match.group(2).strip()
# #             status   = match.group(3).strip().lower().replace(" ", "_")
# #             priority = match.group(4).strip().lower()
# #             created  = match.group(5).strip()

# #             if not title:
# #                 continue

# #             issues.append({
# #                 "number":   number,
# #                 "title":    title,
# #                 "status":   status,
# #                 "priority": priority,
# #                 "created":  created,
# #             })

# #         return issues
# #     except Exception as e:
# #         print(f"Doc fetch error: {e}")
# #         return []
    
# # @router.get("/issues")
# # def list_issues(doc_id: str = Query(...)):
# #     issues = get_all_issues(doc_id=doc_id)
# #     return {"success": True, "issues": issues}
# from fastapi import APIRouter, Query
# from pydantic import BaseModel
# from typing import Optional

# from app.models.intent import IntentRequest
# from app.services.intent_service import parse_intent
# from app.services.gdocs_service import (
#     create_issue, update_issue, resolve_issue, get_all_issues
# )

# router = APIRouter()


# class ExecuteRequest(BaseModel):
#     transcript: str
#     confirmed: bool = False
#     doc_id: Optional[str] = None


# class PreviewResponse(BaseModel):
#     success: bool
#     confirmation_message: str
#     action: str
#     fields: dict
#     needs_clarification: bool
#     confidence: float
#     error: Optional[str] = None


# class ExecuteResponse(BaseModel):
#     success: bool
#     message: str
#     result: Optional[dict] = None
#     error: Optional[str] = None

# @router.get("/issues")
# def get_issues(doc_id: str = Query(...), tab_id: str = Query(None)):
#     if not doc_id:
#         return {"success": False, "error": "doc_id required"}
    
#     from app.services.gdocs_service import get_document, _get_tab_id
#     doc = get_document(doc_id)
#     resolved_tab_id = tab_id or _get_tab_id(doc, "issues")
    
#     # Tab name nikalo
#     tab_name = "Main"
#     tabs = doc.get("tabs", [])
#     for tab in tabs:
#         props = tab.get("tabProperties", {})
#         if props.get("tabId") == resolved_tab_id:
#             tab_name = props.get("title", "Issues")
#             break
    
#     issues = get_all_issues(doc_id=doc_id, tab_id=resolved_tab_id)
#     return {"success": True, "issues": issues, "tab_name": tab_name}

# # @router.get("/issues")
# # def get_issues(doc_id: str = Query(...)):
# #     if not doc_id:
# #         return {"success": False, "error": "doc_id required"}
# #     issues = get_all_issues(doc_id=doc_id)
# #     print(f"Issues found: {issues}")
# #     return {"success": True, "issues": issues}


# @router.post("/preview", response_model=PreviewResponse)
# def preview_action(request: ExecuteRequest):
#     existing_issues = get_all_issues(doc_id=request.doc_id)

#     intent_response = parse_intent(IntentRequest(
#         transcript=request.transcript,
#         existing_issues=existing_issues
#     ))

#     if not intent_response.success or not intent_response.intent:
#         return PreviewResponse(
#             success=False,
#             confirmation_message="Could not understand. Please try again.",
#             action="unknown",
#             fields={},
#             needs_clarification=True,
#             confidence=0.0,
#             error=intent_response.error
#         )

#     intent = intent_response.intent

#     return PreviewResponse(
#         success=True,
#         confirmation_message=intent.confirmation_message,
#         action=intent.action.value,
#         fields=intent.fields.model_dump(exclude_none=True),
#         needs_clarification=intent.needs_clarification,
#         confidence=intent.confidence
#     )

# @router.get("/doc-title")
# def get_doc_title(doc_id: str = Query(...)):
#     try:
#         from app.services.gdocs_service import get_document
#         doc = get_document(doc_id)
#         return {"success": True, "title": doc.get("title", "Untitled")}
#     except Exception as e:
#         return {"success": False, "title": "Untitled", "error": str(e)}
    
# @router.post("/execute", response_model=ExecuteResponse)
# def execute_action(request: ExecuteRequest):
#     existing_issues = get_all_issues(doc_id=request.doc_id)

#     intent_response = parse_intent(IntentRequest(
#         transcript=request.transcript,
#         existing_issues=existing_issues
#     ))

#     if not intent_response.success or not intent_response.intent:
#         return ExecuteResponse(
#             success=False,
#             message="Intent could not be parsed",
#             error=intent_response.error
#         )

#     intent = intent_response.intent
#     fields = intent.fields
#     action = intent.action.value

#     # ── CREATE ────────────────────────────────────────────────────────────────
#     if action == "create_issue":
#         if not fields.title and not fields.description:
#             return ExecuteResponse(
#                 success=False,
#                 message="Issue title or description is missing",
#                 error="Incomplete fields"
#             )

#         # result = create_issue(
#         #     title=fields.title or fields.description[:60],
#         #     description=fields.description or fields.title,
#         #     issue_type=fields.issue_type.value if fields.issue_type else "issue",
#         #     module=fields.module,
#         #     note=fields.note,
#         #     doc_id=request.doc_id,
#         #     priority=fields.priority.value if hasattr(fields, 'priority') and fields.priority else "medium",
#         #     status="open"
#         # )

#         result = create_issue(
#     title=fields.title or fields.description[:60],
#     description=fields.description or fields.title,
#     issue_type=fields.issue_type.value if fields.issue_type else "issue",
#     module=fields.module,
#     note=fields.note,
#     doc_id=request.doc_id,
#     observations=fields.observations or [],
#     priority=fields.priority.value if fields.priority else "medium",
#     status="open"
# )
#         if "error" in result:
#             return ExecuteResponse(success=False, message=result["error"], error=result["error"])

#         return ExecuteResponse(
#             success=True,
#             message=f"Issue #{result['issue_number']} added to doc ✓",
#             result=result
#         )

#     # ── UPDATE ────────────────────────────────────────────────────────────────
#     # elif action == "update_issue":
#     #     if not fields.issue_number:
#     #         return ExecuteResponse(
#     #             success=False,
#     #             message="Which issue to update? Please mention the issue number.",
#     #             error="issue_number missing"
#     #         )

#     #     result = update_issue(
#     #         issue_number=fields.issue_number,
#     #         new_description=fields.description or "",
#     #         doc_id=request.doc_id
#     #     )

#     #     if "error" in result:
#     #         return ExecuteResponse(success=False, message=result["error"], error=result["error"])

#     #     return ExecuteResponse(
#     #         success=True,
#     #         message=f"Issue #{fields.issue_number} updated ✓",
#     #         result=result
#     #     )
#     elif action == "update_issue":
#     if not fields.issue_number:
#         # ← Agar issue_number nahi hai toh create karo update mat karo
#         if fields.title or fields.description:
#             result = create_issue(
#                 title=fields.title or fields.description[:60],
#                 description=fields.description or fields.title,
#                 issue_type=fields.issue_type.value if fields.issue_type else "issue",
#                 module=fields.module,
#                 note=fields.note,
#                 doc_id=request.doc_id,
#                 observations=fields.observations or [],
#                 priority=fields.priority.value if fields.priority else "medium",
#                 status="open"
#             )
#             if "error" in result:
#                 return ExecuteResponse(success=False, message=result["error"], error=result["error"])
#             return ExecuteResponse(
#                 success=True,
#                 message=f"Issue #{result['issue_number']} added to doc ✓",
#                 result=result
#             )
#         return ExecuteResponse(
#             success=False,
#             message="Please mention the issue number to update. Example: 'Update issue 3 — new description'",
#             error="issue_number missing"
#         )
#     # ── RESOLVE ───────────────────────────────────────────────────────────────
#     elif action == "resolve_issue":
#         if fields.issue_number:
#             result = resolve_issue(issue_number=fields.issue_number, doc_id=request.doc_id)

#             if "error" in result:
#                 return ExecuteResponse(success=False, message=result["error"], error=result["error"])

#             return ExecuteResponse(
#                 success=True,
#                 message=f"Issue #{fields.issue_number} resolved ✓",
#                 result=result
#             )

#         elif fields.issue_keyword or fields.module:
#             keyword = (fields.issue_keyword or fields.module or "").lower()
#             matched = next((i for i in existing_issues if keyword in i["title"].lower()), None)

#             if not matched:
#                 return ExecuteResponse(
#                     success=False,
#                     message=f"No issue matched '{keyword}'. Please mention the issue number.",
#                     error="No match found"
#                 )

#             result = resolve_issue(issue_number=matched["number"], doc_id=request.doc_id)

#             return ExecuteResponse(
#                 success=True,
#                 message=f"Issue #{matched['number']} resolved ✓",
#                 result=result
#             )

#         else:
#             return ExecuteResponse(
#                 success=False,
#                 message="Which issue is resolved? Please mention the number or keyword.",
#                 error="issue_number and issue_keyword both missing"
#             )

#     else:
#         return ExecuteResponse(
#             success=False,
#             message="Could not understand — try 'add issue', 'update issue', or 'resolved'",
#             error="unknown action"
#         )


from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

from app.models.intent import IntentRequest
from app.services.intent_service import parse_intent
from app.services.gdocs_service import (
    create_issue, update_issue, resolve_issue, get_all_issues,
    get_document, _get_tab_id
)

router = APIRouter()


class ExecuteRequest(BaseModel):
    transcript: str
    confirmed: bool = False
    doc_id: Optional[str] = None
    tab_id: Optional[str] = None


class PreviewResponse(BaseModel):
    success: bool
    confirmation_message: str
    action: str
    fields: dict
    needs_clarification: bool
    confidence: float
    error: Optional[str] = None


class ExecuteResponse(BaseModel):
    success: bool
    message: str
    result: Optional[dict] = None
    error: Optional[str] = None


# ─── GET Issues ───────────────────────────────────────────────────────────────

@router.get("/issues")
def get_issues(doc_id: str = Query(...), tab_id: str = Query(None)):
    if not doc_id:
        return {"success": False, "error": "doc_id required"}

    doc  = get_document(doc_id)
    tabs = doc.get("tabs", [])

    # Available tabs
    available_tabs = []
    for tab in tabs:
        props = tab.get("tabProperties", {})
        available_tabs.append({
            "id":   props.get("tabId"),
            "name": props.get("title", "Untitled")
        })
        for child in tab.get("childTabs", []):
            cp = child.get("tabProperties", {})
            available_tabs.append({
                "id":   cp.get("tabId"),
                "name": cp.get("title", "Untitled")
            })

    issues = get_all_issues(doc_id=doc_id, tab_id=tab_id)
    return {
        "success":    True,
        "issues":     issues,
        "tabs":       available_tabs,
        "active_tab": tab_id
    }


# ─── GET Doc Title ────────────────────────────────────────────────────────────

@router.get("/doc-title")
def get_doc_title(doc_id: str = Query(...)):
    try:
        doc = get_document(doc_id)
        return {"success": True, "title": doc.get("title", "Untitled")}
    except Exception as e:
        return {"success": False, "title": "Untitled", "error": str(e)}


# ─── POST Preview ─────────────────────────────────────────────────────────────

@router.post("/preview", response_model=PreviewResponse)
def preview_action(request: ExecuteRequest):
    existing_issues = get_all_issues(doc_id=request.doc_id, tab_id=request.tab_id)

    intent_response = parse_intent(IntentRequest(
        transcript=request.transcript,
        existing_issues=existing_issues
    ))

    if not intent_response.success or not intent_response.intent:
        return PreviewResponse(
            success=False,
            confirmation_message="Could not understand. Please try again.",
            action="unknown",
            fields={},
            needs_clarification=True,
            confidence=0.0,
            error=intent_response.error
        )

    intent = intent_response.intent
    return PreviewResponse(
        success=True,
        confirmation_message=intent.confirmation_message,
        action=intent.action.value,
        fields=intent.fields.model_dump(exclude_none=True),
        needs_clarification=intent.needs_clarification,
        confidence=intent.confidence
    )


# ─── POST Execute ─────────────────────────────────────────────────────────────

@router.post("/execute", response_model=ExecuteResponse)
def execute_action(request: ExecuteRequest):
    existing_issues = get_all_issues(doc_id=request.doc_id, tab_id=request.tab_id)

    intent_response = parse_intent(IntentRequest(
        transcript=request.transcript,
        existing_issues=existing_issues
    ))

    if not intent_response.success or not intent_response.intent:
        return ExecuteResponse(
            success=False,
            message="Could not understand your request. Please try again.",
            error=intent_response.error
        )

    intent = intent_response.intent
    fields = intent.fields
    action = intent.action.value

    # ── CREATE ────────────────────────────────────────────────────────────────
    if action == "create_issue":
        if not fields.title and not fields.description:
            return ExecuteResponse(
                success=False,
                message="Please provide a title or description for the issue.",
                error="Incomplete fields"
            )

        result = create_issue(
            title=fields.title or fields.description[:60],
            description=fields.description or fields.title,
            issue_type=fields.issue_type.value if fields.issue_type else "issue",
            module=fields.module,
            note=fields.note,
            doc_id=request.doc_id,
            tab_id=request.tab_id,
            observations=fields.observations or [],
            priority=fields.priority.value if fields.priority else "medium",
            status="open"
        )

        if "error" in result:
            return ExecuteResponse(success=False, message=result["error"], error=result["error"])

        return ExecuteResponse(
            success=True,
            message=f"Issue #{result['issue_number']} added to doc ✓",
            result=result
        )

    # ── UPDATE ────────────────────────────────────────────────────────────────
    elif action == "update_issue":
        if not fields.issue_number:
            if fields.title or fields.description:
                result = create_issue(
                    title=fields.title or fields.description[:60],
                    description=fields.description or fields.title,
                    issue_type=fields.issue_type.value if fields.issue_type else "issue",
                    module=fields.module,
                    note=fields.note,
                    doc_id=request.doc_id,
                    tab_id=request.tab_id,
                    observations=fields.observations or [],
                    priority=fields.priority.value if fields.priority else "medium",
                    status="open"
                )
                if "error" in result:
                    return ExecuteResponse(success=False, message=result["error"], error=result["error"])
                return ExecuteResponse(
                    success=True,
                    message=f"Issue #{result['issue_number']} added to doc ✓",
                    result=result
                )
            return ExecuteResponse(
                success=False,
                message="Please mention the issue number to update. Example: 'Update issue 3 — new description'",
                error="issue_number missing"
            )

        result = update_issue(
            issue_number=fields.issue_number,
            new_description=fields.description or "",
            doc_id=request.doc_id
        )

        if "error" in result:
            return ExecuteResponse(success=False, message=result["error"], error=result["error"])

        return ExecuteResponse(
            success=True,
            message=f"Issue #{fields.issue_number} updated ✓",
            result=result
        )

    # ── RESOLVE ───────────────────────────────────────────────────────────────
    elif action == "resolve_issue":
        if fields.issue_number:
            result = resolve_issue(issue_number=fields.issue_number, doc_id=request.doc_id, tab_id=request.tab_id )

            if "error" in result:
                return ExecuteResponse(success=False, message=result["error"], error=result["error"])

            return ExecuteResponse(
                success=True,
                message=f"Issue #{fields.issue_number} resolved ✓",
                result=result
            )

        elif fields.issue_keyword or fields.module:
            keyword = (fields.issue_keyword or fields.module or "").lower()
            matched = next((i for i in existing_issues if keyword in i["title"].lower()), None)

            if not matched:
                return ExecuteResponse(
                    success=False,
                    message=f"No issue matched '{keyword}'. Please mention the issue number.",
                    error="No match found"
                )

            result = resolve_issue(issue_number=matched["number"], doc_id=request.doc_id)

            return ExecuteResponse(
                success=True,
                message=f"Issue #{matched['number']} resolved ✓",
                result=result
            )

        else:
            return ExecuteResponse(
                success=False,
                message="Which issue is resolved? Please mention the number or keyword.",
                error="issue_number and issue_keyword both missing"
            )

    # ── UNKNOWN ───────────────────────────────────────────────────────────────
    else:
        return ExecuteResponse(
            success=False,
            message="Could not understand — try 'add issue', 'update issue', or 'resolved'",
            error="unknown action"
        )