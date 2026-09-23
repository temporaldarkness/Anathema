import re
from .memory_client import MemoryClient

class ReactionChecker:
    def __init__(self, memory_client: MemoryClient):
        self.memory = memory_client
    
    def check_message(self, content: str, user_uid: str):
        reactions = set()
        for keyword, emoji_uid in self.memory.keywords:
            if keyword.lower() in content.lower():
                emoji_source = self.memory.get_emoji_source(emoji_uid)
                if emoji_source:
                    reactions.add((emoji_source, emoji_uid))
        
        for known_uid, emoji_uid in self.memory.user_reactions:
            if known_uid == user_uid:
                emoji_source = self.memory.get_emoji_source(emoji_uid)
                if emoji_source:
                    reaction.add((emoji_source, emoji_uid))
        
        for known_uid, emoji_uid in self.memory.user_reactions:
            if known_uid == user_uid:
                emoji_source = self.memory.get_emoji_source(emoji_uid)
                if emoji_source:
                    reactions.add((emoji_source, emoji_uid))
        return list(reactions)