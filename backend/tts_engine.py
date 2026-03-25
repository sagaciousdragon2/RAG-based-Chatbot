import asyncio
import io
from pathlib import Path

class TTSEngine:
    def __init__(self):
        self.voice = "en-US-AriaNeural"  # Fast, natural voice
    
    async def _speak_async(self, text: str) -> bytes:
        import edge_tts
        communicate = edge_tts.Communicate(text, self.voice)
        audio_buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])
        audio_buffer.seek(0)
        return audio_buffer.getvalue()
    
    def speak(self, text: str) -> bytes:
        if not text:
            return b""
        
        text = text.strip()
        if len(text) > 500:
            text = text[:500]
        
        try:
            return asyncio.run(self._speak_async(text))
        except Exception as e:
            print(f"[TTS] Edge-tts failed: {e}")
            raise

tts_engine = TTSEngine()