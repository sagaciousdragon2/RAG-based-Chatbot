import asyncio
import io
import os
import hashlib
from pathlib import Path
from typing import AsyncGenerator

class TTSEngine:
    def __init__(self):
        self.voice = "en-US-AriaNeural"  # Fast, natural voice
        self.cache_dir = Path("ttscache")
        self.cache_dir.mkdir(exist_ok=True)
    
    def _get_cache_path(self, text: str) -> Path:
        """Generate a unique filename for a given text and voice."""
        hash_key = hashlib.md5(f"{text}_{self.voice}".encode()).hexdigest()
        return self.cache_dir / f"{hash_key}.mp3"

    async def stream_audio(self, text: str) -> AsyncGenerator[bytes, None]:
        """Provides an async generator that yields audio chunks and caches the result."""
        if not text:
            return

        text = text.strip()[:500]
        cache_path = self._get_cache_path(text)

        # check cache first
        if cache_path.exists():
            print(f"[TTS] Streaming from cache: {cache_path.name}")
            with open(cache_path, "rb") as f:
                while chunk := f.read(4096):
                    yield chunk
            return

        # otherwise stream from edge-tts and save to cache
        import edge_tts
        print(f"[TTS] Generating and caching: {text[:30]}...")
        communicate = edge_tts.Communicate(text, self.voice)
        
        audio_data = []
        try:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    data = chunk["data"]
                    audio_data.append(data)
                    yield data
            
            # Save to cache after streaming completes
            if audio_data:
                with open(cache_path, "wb") as f:
                    f.write(b"".join(audio_data))
        except Exception as e:
            print(f"[TTS] Error during streaming: {e}")
            raise

tts_engine = TTSEngine()