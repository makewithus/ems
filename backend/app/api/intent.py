from fastapi import APIRouter
from ems.backend.app.models.intent import IntentRequest, IntentResponse
from ems.backend.app.services.intent_service import parse_intent
from ems.backend.app.services.gdocs_service import get_all_issues

router = APIRouter()


@router.post("/parse-intent", response_model=IntentResponse)
def parse_intent_route(request: IntentRequest):
    if not request.existing_issues:
        try:
            request = IntentRequest(
                transcript=request.transcript,
                existing_issues=get_all_issues()
            )
        except:
            pass
    return parse_intent(request)