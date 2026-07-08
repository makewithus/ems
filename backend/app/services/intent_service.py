import os
import json
import requests
from dotenv import load_dotenv
from app.models.intent import (
    ParsedIntent,
    IssueFields,
    ActionType,
    IntentRequest,    # ← yeh missing tha
    IntentResponse    # ← yeh bhi check karo
)
load_dotenv() 

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SYSTEM_PROMPT = """
You are an EMS (Employee Management System) issue tracker AI.
Your job is to extract structured issue details from user input and return ONLY valid JSON.

Return this exact JSON structure:
{
  "action": "create_issue",
  "fields": {
    "issue_number": null,
    "title": "Clear 5-7 word title",
    "description": "Detailed explanation of the issue — what is happening, where it occurs, and what the expected behavior should be. Minimum 2 sentences.",
    "issue_type": "issue",
    "module": "Module name if mentioned",
    "priority": "medium",
    "observations": ["specific observation 1", "specific observation 2"],
    "note": null
  },
  "confidence": 0.95,
  "confirmation_message": "Creating issue: [title]",
  "needs_clarification": false
}

ACTION RULES:
- User says add/create/log/note/new/report → "create_issue"
- User says update/change/edit/modify → "update_issue"
- User says resolved/fixed/done/close/completed → "resolve_issue"
- Unclear intent → "unknown", needs_clarification: true

FIELD RULES:
- title: Short and specific, max 7 words, capitalize first letter
- description: MUST be detailed — explain what is broken, where, and impact. Never just repeat the title. Minimum 2 sentences.
- issue_type: "issue" if something is broken/wrong, "feature" if new functionality needed
- module: Extract from context — Login, Dashboard, Navbar, Sidebar, Attendance, Payroll, Members, Certificate, Finance, Reports, Settings, etc.
- priority: "low" / "medium" / "high" / "critical" — infer from urgency words ("urgent", "critical", "blocking" → high/critical)
- observations: List of specific symptoms or behaviors mentioned. Empty array [] if none.
- issue_number: Only fill when user says "issue 3" or "#5" explicitly

PRIORITY INFERENCE:
- "urgent", "critical", "blocking", "production down" → "critical"
- "important", "asap", "broken for users" → "high"  
- "minor", "small", "low priority" → "low"
- Default → "medium"

EXAMPLES:
Input: "navbar is broken on mobile"
Output: {
  "action": "create_issue",
  "fields": {
    "issue_number": null,
    "title": "Navbar Broken on Mobile",
    "description": "The navigation bar is not functioning correctly on mobile devices. Users are unable to navigate between pages as the navbar fails to render or respond to touch inputs properly.",
    "issue_type": "issue",
    "module": "Navbar",
    "priority": "medium",
    "observations": ["Navbar fails to render on mobile screen", "Touch inputs not responding on navbar"],
    "note": null
  },
  "confidence": 0.95,
  "confirmation_message": "Creating issue: Navbar Broken on Mobile",
  "needs_clarification": false
}

Input: "login page not loading after password reset urgent"
Output: {
  "action": "create_issue",
  "fields": {
    "issue_number": null,
    "title": "Login Page Not Loading After Reset",
    "description": "The login page fails to load after a user completes the password reset flow. This is critically blocking users from accessing their accounts and needs immediate attention.",
    "issue_type": "issue",
    "module": "Login",
    "priority": "critical",
    "observations": ["Login page blank after password reset", "Users cannot access accounts"],
    "note": null
  },
  "confidence": 0.97,
  "confirmation_message": "Creating critical issue: Login Page Not Loading After Reset",
  "needs_clarification": false
}

Input: "resolve issue 3"
Output: {
  "action": "resolve_issue",
  "fields": {
    "issue_number": 3,
    "title": null,
    "description": null,
    "issue_type": null,
    "module": null,
    "priority": null,
    "observations": [],
    "note": null
  },
  "confidence": 0.99,
  "confirmation_message": "Resolving issue #3",
  "needs_clarification": false
}

CRITICAL RULES:
- Return ONLY raw JSON — no markdown, no backticks, no explanation
- description must ALWAYS be detailed and meaningful — never just 2-3 words
- observations must be specific bullet points extracted from user input
- Never leave description as null for create_issue
"""
# SYSTEM_PROMPT = """
# You are an AI assistant for an EMS (Employee Management System) portal.
# You help manage project issues professionally.

# Extract intent from transcript and return only JSON — no extra text, no markdown.

# JSON format:
# {
#   "action": "create_issue",
#   "fields": {
#     "issue_number": null,
#     "title": "Professional Issue Title (max 8 words, title case)",
#     "description": "Professional multi-line description",
#     "observations": ["observation 1", "observation 2"],
#     "issue_type": "issue",
#     "module": "module name if mentioned",
#     "priority": "medium",
#     "status": "open",
#     "note": null,
#     "issue_keyword": null
#   },
#   "confidence": 0.95,
#   "confirmation_message": "Understood: Create issue — PDF Export Header Formatting Issue",
#   "needs_clarification": false
# }

# PROFESSIONAL FORMATTING RULES — VERY IMPORTANT:
# - title: Always Title Case, max 8 words, professional (e.g. "PDF Export Header Formatting Issue")
# - description: Always a complete professional paragraph minimum 2 sentences
# - observations: Extract specific problems as bullet points (minimum 2 observations)
# - Never store raw speech as-is
# - Always rewrite professionally

# Example:
# Input: "pdf export not working header issue"
# Output:
# {
#   "title": "PDF Export Header Formatting Issue",
#   "description": "The PDF export functionality is experiencing header alignment and formatting inconsistencies that require immediate attention.",
#   "observations": [
#     "Header positioning is incorrect",
#     "Layout formatting requires correction",
#     "PDF export output is inconsistent"
#   ]
# }

# Action rules:
# - "add", "note", "log", "new issue", "create" → create_issue
# - "update", "change", "edit", "progress", "testing", "blocked" → update_issue
# - "resolved", "fixed", "done", "completed" → resolve_issue
# - "delete", "remove", "discard", "drop" → delete_issue
# - Unclear → unknown, needs_clarification: true

# Issue type:
# - Something broken → "issue"
# - New functionality → "feature"

# Priority rules:
# - "urgent", "critical", "breaking", "crash" → "high"
# - "slow", "minor", "small" → "low"
# - Default → "medium"

# Status rules:
# - New issue → "open"
# - Partial fix → "in_progress"
# - Ready for testing → "testing"
# - Blocked → "blocked"
# - Fully fixed → "resolved"
# - Signed off → "closed"

# issue_keyword: fill when user mentions resolve/update but no issue number.
# issue_number: fill only when user explicitly says a number like "issue 3".

# confirmation_message rules — ALWAYS fill with real values:
# - create_issue  → "Understood: Create issue — {title}"
# - update_issue  → "Understood: Update issue #{number} — {detail}"
# - resolve_issue → "Understood: Resolve issue — {title or keyword}"
# - unknown       → "Could not understand — please try again"
# """

def build_user_prompt(request: IntentRequest) -> str:
    prompt = f'Transcript: "{request.transcript}"'

    if request.existing_issues:
        issues_text = "\n".join([
            f"  #{i['number']}: {i['title']}"
            for i in request.existing_issues[:10]
        ])
        prompt += f"\n\nExisting issues in doc (for matching):\n{issues_text}"

    return prompt
import time

def call_ai(prompt: str) -> str:
    models = [
        "moonshotai/kimi-k2:free",
        "openai/gpt-oss-20b:free",
        "qwen/qwen3-32b:free",
        "google/gemma-3-27b-it:free",
        # "google/gemini-2.0-flash-lite:free",           # fastest
        # "google/gemini-2.5-flash:free",                # very good
        # "mistralai/mistral-small-3.2-24b-instruct:free", # reliable
        # "meta-llama/llama-3.3-70b-instruct:free", 
    ]
    
    for model in models:
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "max_tokens": 1024,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt}
                    ]
                },
                timeout=30
            )

            data = response.json()
            print(f"Trying model: {model}")
            print("Response:", data)

            if "error" in data:
                print(f"Model {model} failed: {data['error']}")
                continue

            if "choices" not in data:
                continue

            content = data["choices"][0]["message"].get("content")
            if not content:
                continue

            return content

        except Exception as e:
            print(f"Model {model} exception: {e}")
            time.sleep(1)
            continue

    raise Exception("All models failed — please try again")

# def call_ai(prompt: str) -> str:
#     response = requests.post(
#         "https://openrouter.ai/api/v1/chat/completions",
#         headers={
#             "Authorization": f"Bearer {OPENROUTER_API_KEY}",
#             "Content-Type": "application/json"
#         },
#         json={
#             "model": "meta-llama/llama-3.3-70b-instruct:free",
# "max_tokens": 1024,
#             "messages": [
#                 {"role": "system", "content": SYSTEM_PROMPT},
#                 {"role": "user", "content": prompt}
#             ]
#         }
#     )

#     data = response.json()
#     print("OpenRouter response:", data)

#     if "error" in data:
#         raise Exception(f"OpenRouter error: {data['error']}")

#     if "choices" not in data:
#         raise Exception(f"Unexpected response: {data}")

#     # None check karo
#     content = data["choices"][0]["message"].get("content")
#     if not content:
#         raise Exception("Model returned empty response")

#     return content
# def call_ai(prompt: str) -> str:
#     response = requests.post(
#         "https://openrouter.ai/api/v1/chat/completions",
#         headers={
#             "Authorization": f"Bearer {OPENROUTER_API_KEY}",
#             "Content-Type": "application/json"
#         },
# #         json={
# #     "model": "google/gemini-2.5-pro",
# #     "max_tokens": 300,
# #     "messages": [
# #         {"role": "system", "content": SYSTEM_PROMPT},
# #         {"role": "user", "content": prompt}
# #     ]
# # }
# json={
#     "model": "poolside/laguna-xs-2.1:free",
# "max_tokens": 1024,# ← 463 se kam rakho
#     "messages": [
#         {"role": "system", "content": SYSTEM_PROMPT},
#         {"role": "user", "content": prompt}
#     ]
# }
#     )
    
#     data = response.json()
    
#     # Debug ke liye — ek baar print karo
#     print("OpenRouter response:", data)
    
#     # Error check
#     if "error" in data:
#         raise Exception(f"OpenRouter error: {data['error']}")
    
#     if "choices" not in data:
#         raise Exception(f"Unexpected response: {data}")
    
#     return data["choices"][0]["message"]["content"]

# def parse_intent(request: IntentRequest) -> IntentResponse:
#     try:
#         raw = call_ai(build_user_prompt(request)).strip()

#         if "```" in raw:
#             raw = raw.split("```")[1]
#             if raw.startswith("json"):
#                 raw = raw[4:]

#         data = json.loads(raw.strip())

#         intent = ParsedIntent(
#             action=data["action"],
#             fields=IssueFields(**data.get("fields", {})),
#             confidence=data.get("confidence", 0.5),
#             raw_transcript=request.transcript,
#             confirmation_message=data.get("confirmation_message", ""),
#             needs_clarification=data.get("needs_clarification", False)
#         )

#         return IntentResponse(success=True, intent=intent)

#     except json.JSONDecodeError as e:
#         return IntentResponse(success=False, error=f"JSON parse error: {str(e)}")
#     except Exception as e:
#         return IntentResponse(success=False, error=str(e))
# def parse_intent(request: IntentRequest) -> IntentResponse:
#     try:
#         raw = call_ai(build_user_prompt(request)).strip()

#         # Saare possible formats handle karo
#         if "```json" in raw:
#             raw = raw.split("```json")[1].split("```")[0]
#         elif "```" in raw:
#             raw = raw.split("```")[1]
#             if raw.startswith("json"):
#                 raw = raw[4:]

#         raw = raw.strip()

#         # JSON extract karo agar extra text hai
#         start = raw.find("{")
#         end   = raw.rfind("}") + 1
#         if start != -1 and end > start:
#             raw = raw[start:end]

#         data = json.loads(raw)

#         intent = ParsedIntent(
#             action=data["action"],
#             fields=IssueFields(**data.get("fields", {})),
#             confidence=data.get("confidence", 0.5),
#             raw_transcript=request.transcript,
#             confirmation_message=data.get("confirmation_message", ""),
#             needs_clarification=data.get("needs_clarification", False)
#         )

#         return IntentResponse(success=True, intent=intent)

#     except json.JSONDecodeError as e:
#         return IntentResponse(success=False, error=f"JSON parse error: {str(e)}")
#     except Exception as e:
#         return IntentResponse(success=False, error=str(e))
def parse_intent(request: IntentRequest) -> IntentResponse:
    try:
        raw = call_ai(build_user_prompt(request)).strip()

        # Clean response — control characters aur markdown remove karo
        raw = raw.replace('\x00', '').replace('\r', '')
        
        # Backticks remove karo
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:]
                if part.strip().startswith("{"):
                    raw = part.strip()
                    break

        # Sirf JSON part nikalo — { se } tak
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

        # Control characters clean karo
        import re as re2
        raw = re2.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', raw)

        data = json.loads(raw)

        intent = ParsedIntent(
            action=data["action"],
            fields=IssueFields(**data.get("fields", {})),
            confidence=data.get("confidence", 0.5),
            raw_transcript=request.transcript,
            confirmation_message=data.get("confirmation_message") or f"Do you want to {data.get('action', 'perform this action')}?",
            # confirmation_message=data.get("confirmation_message", ""),
            needs_clarification=data.get("needs_clarification", False)
        )

        return IntentResponse(success=True, intent=intent)

    except json.JSONDecodeError as e:
        # Retry with simpler prompt
        try:
            simple_prompt = f'Extract intent from: "{request.transcript}". Return JSON with action (create_issue/update_issue/resolve_issue/unknown), title, description fields only.'
            raw2 = call_ai(simple_prompt).strip()
            start = raw2.find("{")
            end = raw2.rfind("}") + 1
            if start != -1:
                raw2 = raw2[start:end]
            data = json.loads(raw2)
            intent = ParsedIntent(
                action=data.get("action", "unknown"),
                fields=IssueFields(**{k: v for k, v in data.get("fields", {}).items() if k in IssueFields.model_fields}),
                confidence=data.get("confidence", 0.5),
                raw_transcript=request.transcript,
                confirmation_message=data.get("confirmation_message", f"Understood: {request.transcript[:50]}"),
                needs_clarification=False
            )
            return IntentResponse(success=True, intent=intent)
        except:
            return IntentResponse(success=False, error="Could not understand your request. Please try again with a clearer description.")
    except Exception as e:
        return IntentResponse(success=False, error=str(e))
# def parse_intent(request: IntentRequest) -> IntentResponse:
#     try:
      
#         raw = call_ai(build_user_prompt(request))
        
#         if not raw:
#             return IntentResponse(success=False, error="Empty response from AI")
        
#         raw = raw.strip()
#         # raw = call_ai(build_user_prompt(request)).strip()

#         # # Extract only first JSON object
#         # if "```json" in raw:
#         #     raw = raw.split("```json")[1].split("```")[0]
#         # elif "```" in raw:
#         #     raw = raw.split("```")[1]
#         #     if raw.startswith("json"):
#         #         raw = raw[4:]

#         raw = raw.strip()

#         # Sirf pehla valid JSON object lo
#         start = raw.find("{")
#         if start == -1:
#             raise ValueError("No JSON found")
        
#         # Manually first complete JSON object find karo
#         depth = 0
#         end = start
#         for i, ch in enumerate(raw[start:], start):
#             if ch == "{":
#                 depth += 1
#             elif ch == "}":
#                 depth -= 1
#                 if depth == 0:
#                     end = i + 1
#                     break

#         raw = raw[start:end]

#         data = json.loads(raw)

#         intent = ParsedIntent(
#             action=data["action"],
#             fields=IssueFields(**data.get("fields", {})),
#             confidence=data.get("confidence", 0.5),
#             raw_transcript=request.transcript,
#             confirmation_message=data.get("confirmation_message", ""),
#             needs_clarification=data.get("needs_clarification", False)
#         )

#         return IntentResponse(success=True, intent=intent)

#     except json.JSONDecodeError as e:
#         return IntentResponse(success=False, error=f"JSON parse error: {str(e)}")
#     except Exception as e:
#         return IntentResponse(success=False, error=str(e))


# import re as re_module

# def parse_intent(request: IntentRequest) -> IntentResponse:
#     try:
#         raw = call_ai(build_user_prompt(request))

#         if not raw:
#             return IntentResponse(success=False, error="Empty response from AI")

#         raw = raw.strip()

#         # Code blocks remove karo
#         if "```json" in raw:
#             raw = raw.split("```json")[1].split("```")[0]
#         elif "```" in raw:
#             raw = raw.split("```")[1]
#             if raw.startswith("json"):
#                 raw = raw[4:]

#         raw = raw.strip()

#         # Sirf pehla complete JSON object extract karo
#         start = raw.find("{")
#         if start == -1:
#             return IntentResponse(success=False, error="No JSON found in response")

#         depth = 0
#         end = start
#         for i, ch in enumerate(raw[start:], start):
#             if ch == "{":
#                 depth += 1
#             elif ch == "}":
#                 depth -= 1
#                 if depth == 0:
#                     end = i + 1
#                     break

#         raw = raw[start:end]

#         # Common JSON errors fix karo
#         # Trailing commas remove karo
#         raw = re_module.sub(r',\s*}', '}', raw)
#         raw = re_module.sub(r',\s*]', ']', raw)
#         # Single quotes replace karo
#         raw = raw.replace("'", '"')
#         # None/True/False fix karo
#         raw = raw.replace(': None', ': null')
#         raw = raw.replace(': True', ': true')
#         raw = raw.replace(': False', ': false')

#         print("Cleaned JSON:", raw)

#         data = json.loads(raw)

#         intent = ParsedIntent(
#             action=data["action"],
#             fields=IssueFields(**data.get("fields", {})),
#             confidence=data.get("confidence", 0.5),
#             raw_transcript=request.transcript,
#             confirmation_message=data.get("confirmation_message", ""),
#             needs_clarification=data.get("needs_clarification", False)
#         )

#         return IntentResponse(success=True, intent=intent)

#     except json.JSONDecodeError as e:
#         return IntentResponse(success=False, error=f"JSON parse error: {str(e)}")
#     except Exception as e:
#         return IntentResponse(success=False, error=str(e))