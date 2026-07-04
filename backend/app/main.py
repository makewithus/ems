from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.api.intent import router as intent_router
from app.api.voice import router as voice_router
from app.api.actions import router as actions_router

load_dotenv()

app = FastAPI(title="Google docs automation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://ems-ashen-eight.vercel.app",  # ← tumhara Vercel URL
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(intent_router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(actions_router, prefix="/api/actions")
