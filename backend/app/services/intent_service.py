import os
import json
import requests
from dotenv import load_dotenv
from ems.backend.app.models.intent import (
    ParsedIntent,
    IssueFields,
    ActionType,
    IntentRequest,    # ← yeh missing tha
    IntentResponse    # ← yeh bhi check karo
)
load_dotenv() 

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

SYSTEM_PROMPT = """
You are an AI assistant for an EMS (Employee Management System) portal.
You help manage project issues professionally.

Extract intent from transcript and return only JSON — no extra text, no markdown.

JSON format:
{
  "action": "create_issue",
  "fields": {
    "issue_number": null,
    "title": "Professional Issue Title (max 8 words, title case)",
    "description": "Professional multi-line description",
    "observations": ["observation 1", "observation 2"],
    "issue_type": "issue",
    "module": "module name if mentioned",
    "priority": "medium",
    "status": "open",
    "note": null,
    "issue_keyword": null
  },
  "confidence": 0.95,
  "confirmation_message": "Understood: Create issue — PDF Export Header Formatting Issue",
  "needs_clarification": false
}

PROFESSIONAL FORMATTING RULES — VERY IMPORTANT:
- title: Always Title Case, max 8 words, professional (e.g. "PDF Export Header Formatting Issue")
- description: Always a complete professional paragraph minimum 2 sentences
- observations: Extract specific problems as bullet points (minimum 2 observations)
- Never store raw speech as-is
- Always rewrite professionally

Example:
Input: "pdf export not working header issue"
Output:
{
  "title": "PDF Export Header Formatting Issue",
  "description": "The PDF export functionality is experiencing header alignment and formatting inconsistencies that require immediate attention.",
  "observations": [
    "Header positioning is incorrect",
    "Layout formatting requires correction",
    "PDF export output is inconsistent"
  ]
}

Action rules:
- "add", "note", "log", "new issue", "create" → create_issue
- "update", "change", "edit", "progress", "testing", "blocked" → update_issue
- "resolved", "fixed", "done", "completed" → resolve_issue
- "delete", "remove", "discard", "drop" → delete_issue
- Unclear → unknown, needs_clarification: true

Issue type:
- Something broken → "issue"
- New functionality → "feature"

Priority rules:
- "urgent", "critical", "breaking", "crash" → "high"
- "slow", "minor", "small" → "low"
- Default → "medium"

Status rules:
- New issue → "open"
- Partial fix → "in_progress"
- Ready for testing → "testing"
- Blocked → "blocked"
- Fully fixed → "resolved"
- Signed off → "closed"

issue_keyword: fill when user mentions resolve/update but no issue number.
issue_number: fill only when user explicitly says a number like "issue 3".

confirmation_message rules — ALWAYS fill with real values:
- create_issue  → "Understood: Create issue — {title}"
- update_issue  → "Understood: Update issue #{number} — {detail}"
- resolve_issue → "Understood: Resolve issue — {title or keyword}"
- unknown       → "Could not understand — please try again"
"""

def build_user_prompt(request: IntentRequest) -> str:
    prompt = f'Transcript: "{request.transcript}"'

    if request.existing_issues:
        issues_text = "\n".join([
            f"  #{i['number']}: {i['title']}"
            for i in request.existing_issues[:10]
        ])
        prompt += f"\n\nExisting issues in doc (for matching):\n{issues_text}"

    return prompt


def call_ai(prompt: str) -> str:
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
    "model": "openai/gpt-4o-mini",
    "max_tokens": 500,  # ← 1000 se 500 karo
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt}
    ]
}
    )
    
    data = response.json()
    
    # Debug ke liye — ek baar print karo
    print("OpenRouter response:", data)
    
    # Error check
    if "error" in data:
        raise Exception(f"OpenRouter error: {data['error']}")
    
    if "choices" not in data:
        raise Exception(f"Unexpected response: {data}")
    
    return data["choices"][0]["message"]["content"]

def parse_intent(request: IntentRequest) -> IntentResponse:
    try:
        raw = call_ai(build_user_prompt(request)).strip()

        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        data = json.loads(raw.strip())

        intent = ParsedIntent(
            action=data["action"],
            fields=IssueFields(**data.get("fields", {})),
            confidence=data.get("confidence", 0.5),
            raw_transcript=request.transcript,
            confirmation_message=data.get("confirmation_message", ""),
            needs_clarification=data.get("needs_clarification", False)
        )

        return IntentResponse(success=True, intent=intent)

    except json.JSONDecodeError as e:
        return IntentResponse(success=False, error=f"JSON parse error: {str(e)}")
    except Exception as e:
        return IntentResponse(success=False, error=str(e))