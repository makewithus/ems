# from fastapi import APIRouter
# from pydantic import BaseModel
# from typing import Optional
# from fastapi import Query

# from app.models.intent import IntentRequest
# from app.services.intent_service import parse_intent
# from app.services.gdocs_service import (
#     create_issue, update_issue, resolve_issue,
#     get_all_issues
# )


# router = APIRouter()
# class CreateDocRequest(BaseModel):
#     title: str


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

#         result = create_issue(
#         title=fields.title or fields.description[:60],
#         description=fields.description or fields.title,
#         issue_type=fields.issue_type.value if fields.issue_type else "issue",
#         module=fields.module,
#         note=fields.note,
#         doc_id=request.doc_id,
#         observations=fields.observations,      # ← add
#         priority=fields.priority.value if fields.priority else "medium",  # ← add
#         status=fields.status.value if fields.status else "open",          # ← add
#     )

#         if "error" in result:
#             return ExecuteResponse(
#                 success=False,
#                 message=result["error"],
#                 error=result["error"]
#             )

#         return ExecuteResponse(
#             success=True,
#             message=f"Issue #{result['issue_number']} added to doc ✓",
#             result=result
#         )

#     # ── UPDATE ────────────────────────────────────────────────────────────────
#     elif action == "update_issue":
#         if not fields.issue_number:
#             return ExecuteResponse(
#                 success=False,
#                 message="Which issue to update? Please mention the issue number.",
#                 error="issue_number missing"
#             )

#         result = update_issue(
#             issue_number=fields.issue_number,
#             new_description=fields.description or "",
#             doc_id=request.doc_id
#         )

#         if "error" in result:
#             return ExecuteResponse(
#                 success=False,
#                 message=result["error"],
#                 error=result["error"]
#             )

#         return ExecuteResponse(
#             success=True,
#             message=f"Issue #{fields.issue_number} updated ✓",
#             result=result
#         )

#     # ── RESOLVE ───────────────────────────────────────────────────────────────
#     elif action == "resolve_issue":
#         if fields.issue_number:
#             result = resolve_issue(
#                 issue_number=fields.issue_number,
#                 doc_id=request.doc_id
#             )

#             if "error" in result:
#                 return ExecuteResponse(
#                     success=False,
#                     message=result["error"],
#                     error=result["error"]
#                 )

#             return ExecuteResponse(
#                 success=True,
#                 message=f"Issue #{fields.issue_number} resolved ✓",
#                 result=result
#             )

#         elif fields.issue_keyword or fields.module:
#             keyword = (fields.issue_keyword or fields.module or "").lower()
#             matched = None

#             for issue in existing_issues:
#                 if keyword in issue["title"].lower():
#                     matched = issue
#                     break

#             if not matched:
#                 return ExecuteResponse(
#                     success=False,
#                     message=f"No issue matched '{keyword}'. Please mention the issue number.",
#                     error="No match found"
#                 )

#             result = resolve_issue(
#                 issue_number=matched["number"],
#                 doc_id=request.doc_id
#             )

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

#     # ── UNKNOWN ───────────────────────────────────────────────────────────────
#     else:
#         return ExecuteResponse(
#             success=False,
#             message="Could not understand — try 'add issue', 'update issue', or 'resolved'",
#             error="unknown action"
#         )
    
# @router.get("/docs/search")
# def search_docs(q: str = ""):
#     result = search_drive_docs(q)
#     return result
# def create_doc(request: CreateDocRequest):
#     result = create_new_doc(request.title)
#     return result

# @router.get("/issues")
# def get_issues(doc_id: str = ""):
#     if not doc_id:
#         return {"success": False, "error": "doc_id required"}
#     issues = get_all_issues(doc_id=doc_id)
#     return {"success": True, "issues": issues}

# def get_all_issues(doc_id=None):
#     if not doc_id:
#         return []
#     try:
#         doc  = get_document(doc_id)
#         text = _get_doc_text(doc)
#         issues = []

#         for match in re.finditer(
#             r"Issue #(\d+).*?\nTitle:\s*(.+?)\n.*?Status:\s*(\w[\w ]*?)\s+Priority:\s*(\w+)\s+Created On:\s*(.+?)(?=\nIssue #|\Z)",
#             text, re.DOTALL
#         ):
#             number   = int(match.group(1))
#             title    = match.group(2).strip()
#             status   = match.group(3).strip().lower().replace(" ", "_")
#             priority = match.group(4).strip().lower()
#             created  = match.group(5).strip()

#             if not title:
#                 continue

#             issues.append({
#                 "number":   number,
#                 "title":    title,
#                 "status":   status,
#                 "priority": priority,
#                 "created":  created,
#             })

#         return issues
#     except Exception as e:
#         print(f"Doc fetch error: {e}")
#         return []
    
# @router.get("/issues")
# def list_issues(doc_id: str = Query(...)):
#     issues = get_all_issues(doc_id=doc_id)
#     return {"success": True, "issues": issues}
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

from app.models.intent import IntentRequest
from app.services.intent_service import parse_intent
from app.services.gdocs_service import (
    create_issue, update_issue, resolve_issue, get_all_issues
)

router = APIRouter()


class ExecuteRequest(BaseModel):
    transcript: str
    confirmed: bool = False
    doc_id: Optional[str] = None


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


@router.get("/issues")
def get_issues(doc_id: str = Query(...)):
    if not doc_id:
        return {"success": False, "error": "doc_id required"}
    issues = get_all_issues(doc_id=doc_id)
    print(f"Issues found: {issues}")
    return {"success": True, "issues": issues}


@router.post("/preview", response_model=PreviewResponse)
def preview_action(request: ExecuteRequest):
    existing_issues = get_all_issues(doc_id=request.doc_id)

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


@router.post("/execute", response_model=ExecuteResponse)
def execute_action(request: ExecuteRequest):
    existing_issues = get_all_issues(doc_id=request.doc_id)

    intent_response = parse_intent(IntentRequest(
        transcript=request.transcript,
        existing_issues=existing_issues
    ))

    if not intent_response.success or not intent_response.intent:
        return ExecuteResponse(
            success=False,
            message="Intent could not be parsed",
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
                message="Issue title or description is missing",
                error="Incomplete fields"
            )

        result = create_issue(
            title=fields.title or fields.description[:60],
            description=fields.description or fields.title,
            issue_type=fields.issue_type.value if fields.issue_type else "issue",
            module=fields.module,
            note=fields.note,
            doc_id=request.doc_id,
            priority=fields.priority.value if hasattr(fields, 'priority') and fields.priority else "medium",
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
            return ExecuteResponse(
                success=False,
                message="Which issue to update? Please mention the issue number.",
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
            result = resolve_issue(issue_number=fields.issue_number, doc_id=request.doc_id)

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

    else:
        return ExecuteResponse(
            success=False,
            message="Could not understand — try 'add issue', 'update issue', or 'resolved'",
            error="unknown action"
        )