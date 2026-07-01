import os
import tempfile
import wave
import struct
from pathlib import Path

ALLOWED_EXTENSIONS = {"webm", "wav", "mp3", "mp4", "ogg", "m4a"}
MAX_FILE_SIZE_MB = 25  # Whisper limit


# ─── Validation ───────────────────────────────────────────────────────────────

def validate_audio(audio_bytes: bytes, filename: str) -> dict:
    """
    Audio file validate karo before sending to STT.
    """
    # Size check
    size_mb = len(audio_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        return {
            "valid": False,
            "error": f"File too large ({size_mb:.1f}MB). Max allowed: {MAX_FILE_SIZE_MB}MB"
        }

    # Empty check
    if len(audio_bytes) == 0:
        return {
            "valid": False,
            "error": "Audio file is empty"
        }

    # Extension check
    ext = get_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return {
            "valid": False,
            "error": f"Unsupported format: .{ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        }

    return {"valid": True, "size_mb": round(size_mb, 2)}


# ─── File Helpers ─────────────────────────────────────────────────────────────

def get_extension(filename: str) -> str:
    """
    Filename se extension nikalo — lowercase mein.
    """
    return Path(filename).suffix.lstrip(".").lower()


def save_temp_file(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """
    Audio bytes ko temp file mein save karo.
    Returns temp file path.
    """
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        return tmp.name


def delete_temp_file(path: str) -> None:
    """
    Temp file cleanup karo after use.
    """
    try:
        if os.path.exists(path):
            os.unlink(path)
    except Exception as e:
        print(f"Temp file delete failed: {e}")


# ─── WAV Helpers ──────────────────────────────────────────────────────────────

def get_wav_duration(audio_bytes: bytes) -> float | None:
    """
    WAV file ki duration seconds mein nikalo.
    Non-WAV files ke liye None return karta hai.
    """
    try:
        tmp_path = save_temp_file(audio_bytes, suffix=".wav")

        with wave.open(tmp_path, "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            duration = frames / float(rate)

        delete_temp_file(tmp_path)
        return round(duration, 2)

    except Exception:
        return None


def is_silent(audio_bytes: bytes, threshold: int = 500) -> bool:
    """
    Audio silent hai ya nahi check karo.
    User mic on kar ke kuch nahi bola toh detect karo.
    Only works for WAV format.
    """
    try:
        tmp_path = save_temp_file(audio_bytes, suffix=".wav")

        with wave.open(tmp_path, "rb") as wav_file:
            raw = wav_file.readframes(wav_file.getnframes())
            samples = struct.unpack(f"{len(raw) // 2}h", raw)
            max_amplitude = max(abs(s) for s in samples)

        delete_temp_file(tmp_path)
        return max_amplitude < threshold

    except Exception:
        return False


# ─── Format Info ──────────────────────────────────────────────────────────────

def get_audio_info(audio_bytes: bytes, filename: str) -> dict:
    """
    Audio file ki basic info return karo.
    """
    ext = get_extension(filename)
    size_mb = round(len(audio_bytes) / (1024 * 1024), 3)
    duration = get_wav_duration(audio_bytes) if ext == "wav" else None

    return {
        "filename": filename,
        "extension": ext,
        "size_mb": size_mb,
        "duration_seconds": duration,
        "size_bytes": len(audio_bytes)
    }