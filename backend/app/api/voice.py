from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.services.stt_service import transcribe_with_fallback
from app.services.intent_service import parse_intent
from app.models.intent import IntentRequest
from app.services.gdocs_service import get_all_issues

router = APIRouter()


class TranscribeResponse(BaseModel):
    success: bool
    transcript: str
    error: str | None = None


class VoiceToActionResponse(BaseModel):
    success: bool
    transcript: str
    confirmation_message: str
    action: str
    fields: dict
    confidence: float
    needs_clarification: bool
    error: str | None = None


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    result = transcribe_with_fallback(audio_bytes, audio.filename or "audio.webm")

    return TranscribeResponse(
        success=result["success"],
        transcript=result.get("transcript", ""),
        error=result.get("error")
    )


@router.post("/voice-to-action", response_model=VoiceToActionResponse)
async def voice_to_action(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    # Step 1: Transcribe
    stt_result = transcribe_with_fallback(audio_bytes, audio.filename or "audio.webm")

    if not stt_result["success"]:
        return VoiceToActionResponse(
            success=False,
            transcript="",
            confirmation_message="",
            action="unknown",
            fields={},
            confidence=0.0,
            needs_clarification=True,
            error=stt_result.get("error")
        )

    transcript = stt_result["transcript"]

    # Step 2: Parse intent
    existing_issues = get_all_issues()
    intent_response = parse_intent(IntentRequest(
        transcript=transcript,
        existing_issues=existing_issues
    ))

    if not intent_response.success or not intent_response.intent:
        return VoiceToActionResponse(
            success=False,
            transcript=transcript,
            confirmation_message="Could not understand intent",
            action="unknown",
            fields={},
            confidence=0.0,
            needs_clarification=True,
            error=intent_response.error
        )

    intent = intent_response.intent

    return VoiceToActionResponse(
        success=True,
        transcript=transcript,
        confirmation_message=intent.confirmation_message,
        action=intent.action.value,
        fields=intent.fields.model_dump(exclude_none=True),
        confidence=intent.confidence,
        needs_clarification=intent.needs_clarification
    )
