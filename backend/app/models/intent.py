from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class ActionType(str, Enum):
    CREATE  = "create_issue"
    UPDATE  = "update_issue"
    RESOLVE = "resolve_issue"
    UNKNOWN = "unknown"

class IssueType(str, Enum):
    ISSUE   = "issue"
    FEATURE = "feature"

class Priority(str, Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"

class IssueStatus(str, Enum):
    OPEN        = "open"
    IN_PROGRESS = "in_progress"
    TESTING     = "testing"
    BLOCKED     = "blocked"
    RESOLVED    = "resolved"
    CLOSED      = "closed"

class IssueFields(BaseModel):
    issue_number:  Optional[int]        = None
    title:         Optional[str]        = None
    description:   Optional[str]        = None
    observations:  Optional[List[str]]  = None
    issue_type:    Optional[IssueType]  = None
    module:        Optional[str]        = None
    priority:      Optional[Priority]   = Priority.MEDIUM
    status:        Optional[IssueStatus] = IssueStatus.OPEN
    note:          Optional[str]        = None
    issue_keyword: Optional[str]        = None

class ParsedIntent(BaseModel):
    action:               ActionType
    fields:               IssueFields
    confidence:           float
    raw_transcript:       str
    confirmation_message: str
    needs_clarification:  bool

class IntentRequest(BaseModel):
    transcript:      str
    existing_issues: Optional[list[dict]] = None

class IntentResponse(BaseModel):
    success: bool
    intent:  Optional[ParsedIntent] = None
    error:   Optional[str]          = None