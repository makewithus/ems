from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from ems.backend.app.api.intent import router as intent_router
from ems.backend.app.api.voice import router as voice_router
from ems.backend.app.api.actions import router as actions_router

load_dotenv()

app = FastAPI(title="KMJ EMS Voice Automation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # React frontend
        "http://localhost:3000",  # Next.js EMS portal ← add karo
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(intent_router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(actions_router, prefix="/api/actions")