from typing import Optional
from pydantic import BaseModel


class UnlockRequest(BaseModel):
    password: str


class ChatRequest(BaseModel):
    message:    str
    session_id: Optional[int] = None
    mode:       Optional[str] = "general"


class ProfileUpdate(BaseModel):
    name:     Optional[str] = None
    brief:    Optional[str] = None
    city:     Optional[str] = None
    timezone: Optional[str] = None


class NewsSourcesReplace(BaseModel):
    sources: list


class NewsSourceAdd(BaseModel):
    id:      str
    name:    str
    country: str
    url:     str
    enabled: bool = True


class ReminderCreate(BaseModel):
    title:       str
    due_date:    str
    description: str = ""


class FitnessEntry(BaseModel):
    date:     str
    calories: Optional[int]   = None
    weight:   Optional[float] = None
    workout:  str = ""
    notes:    str = ""


class PullRequest(BaseModel):
    name: str


class ModelAssignment(BaseModel):
    study:   Optional[str] = None
    coding:  Optional[str] = None
    general: Optional[str] = None


class ProjectCreate(BaseModel):
    name:        str
    description: str  = ""
    color:       str  = "#00c8f0"


class TextFileCreate(BaseModel):
    filename:  str
    content:   str
    mime_type: str = "text/plain"


class FileContentUpdate(BaseModel):
    content: str
