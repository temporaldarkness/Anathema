from abc import ABC, abstractmethod


class TTSEngine(ABC):

    name: str = "base"

    @abstractmethod
    async def synthesize(self, text: str, voice_id: str) -> bytes:
        ...