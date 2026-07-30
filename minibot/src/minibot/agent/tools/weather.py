"""Mock weather tool — for learning function calling (no network)."""

from __future__ import annotations

from typing import Any

from minibot.agent.tools.base import Tool

# Deterministic demos so you can predict tool results while learning.
_MOCK_WEATHER: dict[str, dict[str, str | int]] = {
    "beijing": {"condition": "晴", "temp_c": 28, "humidity": 45},
    "上海": {"condition": "多云", "temp_c": 31, "humidity": 70},
    "shanghai": {"condition": "多云", "temp_c": 31, "humidity": 70},
    "杭州": {"condition": "小雨", "temp_c": 24, "humidity": 85},
    "hangzhou": {"condition": "小雨", "temp_c": 24, "humidity": 85},
    "深圳": {"condition": "雷阵雨", "temp_c": 29, "humidity": 80},
    "shenzhen": {"condition": "雷阵雨", "temp_c": 29, "humidity": 80},
}

_DEFAULT = {"condition": "阴", "temp_c": 22, "humidity": 60}


class WeatherTool(Tool):
    name = "get_weather"
    description = (
        "Get the current weather for a city. "
        "Use whenever the user asks about weather, temperature, or rain."
    )

    def parameters_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, e.g. Beijing, Shanghai, 杭州",
                },
            },
            "required": ["city"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        city = str(kwargs.get("city", "")).strip()
        if not city:
            return "Error: city is required"

        key = city.casefold()
        data = _MOCK_WEATHER.get(key) or _MOCK_WEATHER.get(city) or {
            **_DEFAULT,
            "note": "unknown city — returning default mock data",
        }

        condition = data["condition"]
        temp_c = data["temp_c"]
        humidity = data["humidity"]
        note = data.get("note")
        lines = [
            f"city: {city}",
            f"condition: {condition}",
            f"temperature_c: {temp_c}",
            f"humidity_pct: {humidity}",
            "source: mock (no live API)",
        ]
        if note:
            lines.append(f"note: {note}")
        return "\n".join(lines)
