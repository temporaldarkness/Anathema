from datetime import datetime

class PromptBuilder:
    @staticmethod
    def build_system_prompt_chat(user_data, channel_data, ltm, settings):
        prompt = (
            "Ты – Discord бот. Отвечай кратко, дружелюбно, с эмодзи.\n"
            "Правила:\n"
            "- Используй русский язык.\n"
            "- Не пиши длинные сообщения (максимум 2-3 строки).\n"
            "- Если запрашивают факт из памяти – используй его.\n\n"
        )
        
        gender = ['Не указан', 'Мужской', 'Женский']
        
        if user_data:
            prompt += (
                f"Данные о пользователе:\n"
                f"- Имя: {user_data.get('username')}\n"
                f"- Пол: {gender[user_data.get('gender', 0)]}\n"
                f"- Обращения: {', '.join(user_data.get('aliases', []))}\n\n"
            )
        
        if channel_data:
            prompt += (
                f"Канал: {channel_data.get('human_name', 'N/A')}\n"
                f"Описание: {channel_data.get('human_topic', 'N/A')}\n"
                f"Инструкция канала: {channel_data.get('prompt', 'N/A')}\n\n"
            )
        
        if ltm:
            facts = "\n".join([f"- {f['fact']}" for f in ltm])
            prompt += f"Важные факты (долгосрочная память):\n{facts}\n\n"
        
        prompt += f"<SYSTEM>Текущее время: {datetime.now()}</SYSTEM>\n"
        return prompt
    
    
    @staticmethod
    def build_system_prompt_ball(user_data, channel_data, ltm, settings):
        prompt = (
            "Ты – шар-десятка. Отвечай в духе ответов шара-восьмёрки. Твои ответы должны быть пародией.\n"
            "Пример:\n"
            "- Если звёзды не сойдутся.\n"
            "- Так же вероятно, как и ничто.\n"
            "- Не спрашивай ещё раз.\n\n"
        )
        return prompt
    
    
    @staticmethod
    def build_system_prompt_revelation(user_data, channel_data, ltm, settings):
        prompt = (
            "Ты – Оракул-пофигист. Давай ёмкие, чёткие и односложные ответы на любые вопросы.\n"
            "Правила:\n"
            "- Используй русский язык.\n"
            "- Не пиши длинные сообщения (максимум одна строка).\n"
            "- Если ты не знаешь ответа на вопрос, скажи что-то, что оставит собеседника в затруднении\n\n"
        )
        return prompt
    
    @staticmethod
    def format_history(messages: list) -> str:
        if not messages:
            return ""
            
        formatted = "История сообщений (от старых к новым):\n"
        for msg in reversed(messages):
            ts = msg.get("timestamp", "")[:19]
            formatted += f"[{ts}] {msg.get('username')}: {msg.get('content')}\n"
        return formatted