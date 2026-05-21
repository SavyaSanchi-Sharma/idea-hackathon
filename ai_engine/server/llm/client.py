"""Provider-agnostic LLM client.

Speaks the OpenAI /chat/completions wire format so it works unchanged with:
  * Groq         — base_url=https://api.groq.com/openai/v1
  * Gemini       — base_url=https://generativelanguage.googleapis.com/v1beta/openai
  * OpenAI       — base_url=https://api.openai.com/v1
  * Ollama       — base_url=http://localhost:11434/v1 (api_key="ollama")

Env vars:
  ZH_LLM_BASE_URL — required; no trailing slash
  ZH_LLM_API_KEY  — required (Bearer)
  ZH_LLM_MODEL    — required (model id, e.g. "llama-3.1-8b-instant",
                    "gemini-1.5-flash", "gpt-4o-mini")
  ZH_LLM_TIMEOUT  — optional seconds (default 30)

`available()` returns False if any required env var is missing so the chat
route can degrade gracefully to 503 instead of 500.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import httpx


@dataclass
class LLMResponse:
    text: str
    model: str
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class LLMUnavailable(RuntimeError):
    """Raised when env config is missing or the upstream call fails."""


class LLMClient:
    def __init__(self):
        self.base_url = (os.environ.get("ZH_LLM_BASE_URL") or "").rstrip("/")
        self.api_key = os.environ.get("ZH_LLM_API_KEY") or ""
        self.model = os.environ.get("ZH_LLM_MODEL") or ""
        self.timeout = float(os.environ.get("ZH_LLM_TIMEOUT", "30"))

    def available(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def describe(self) -> dict:
        # safe to expose: model + host of base_url, no key
        host = ""
        if self.base_url:
            try:
                host = httpx.URL(self.base_url).host
            except Exception:
                host = self.base_url
        return {"configured": self.available(), "model": self.model, "host": host}

    async def chat(
        self,
        *,
        system: str,
        user: str,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> LLMResponse:
        if not self.available():
            raise LLMUnavailable(
                "LLM not configured. Set ZH_LLM_BASE_URL, ZH_LLM_API_KEY, ZH_LLM_MODEL."
            )

        url = f"{self.base_url}/chat/completions"
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as c:
            try:
                r = await c.post(url, json=body, headers=headers)
            except httpx.RequestError as e:
                raise LLMUnavailable(f"network: {e}") from e

        if r.status_code >= 400:
            raise LLMUnavailable(f"upstream {r.status_code}: {r.text[:400]}")

        try:
            data = r.json()
            choice = data["choices"][0]
            msg = choice["message"]["content"]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMUnavailable(f"bad upstream payload: {e}") from e

        usage = data.get("usage") or {}
        return LLMResponse(
            text=str(msg),
            model=str(data.get("model") or self.model),
            finish_reason=choice.get("finish_reason"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )
