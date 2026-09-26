TOKEN_PRICING = {
    "deepseek/deepseek-v3.2":           {"in": 0.27,  "out": 1.10},
    "x-ai/grok-4.1-fast":               {"in": 0.20,  "out": 0.50},
    "google/gemini-3.1-pro-preview":    {"in": 1.25,  "out": 5.00},
    "anthropic/claude-opus-4-6":        {"in": 15.00, "out": 75.00},
    "google/gemma-3-4b-it":             {"in": 0.10,  "out": 0.10},
}

FLAT_PRICING = {
    "gpt-image-2": 0.04,
    "gemini-3-pro-image-preview": 0.03,
}


def compute_token_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    p = TOKEN_PRICING.get(model)
    if not p:
        return 0.0
    return (tokens_in / 1_000_000) * p["in"] + (tokens_out / 1_000_000) * p["out"]


def compute_flat_cost(model: str, units: int = 1) -> float:
    return FLAT_PRICING.get(model, 0.0) * units