import os
import tempfile
from groq import Groq

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    try:
        with tempfile.NamedTemporaryFile(
            suffix=f".{filename.split('.')[-1]}", delete=False
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        with open(tmp_path, "rb") as audio_file:
            response = groq_client.audio.transcriptions.create(
                file=(filename, audio_file, "audio/webm"),
                model="whisper-large-v3",
                language="en",
                response_format="json",
                temperature=0.0
            )

        os.unlink(tmp_path)

        return {
            "success": True,
            "transcript": response.text.strip()
        }

    except Exception as e:
        return {
            "success": False,
            "transcript": "",
            "error": str(e)
        }


def transcribe_with_fallback(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    # Primary: Groq Whisper
    result = transcribe_audio(audio_bytes, filename)

    if not result["success"]:
        # Fallback: OpenAI Whisper
        try:
            import openai
            openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            with open(tmp_path, "rb") as f:
                response = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="en"
                )

            os.unlink(tmp_path)

            return {
                "success": True,
                "transcript": response.text.strip()
            }

        except Exception as e:
            return {
                "success": False,
                "transcript": "",
                "error": f"Both STT failed: {str(e)}"
            }

    return result