"""
AI Tutor — 'Py the friendly snake'.

Uses Claude when ANTHROPIC_API_KEY is set; otherwise falls back to a built-in
rule-based hint engine so the tutor ALWAYS works with zero configuration.

Pedagogy rule (hard): never hand over the full answer on the first ask. Give a
nudge, ask a guiding question, escalate only if the kid is clearly stuck.
"""
import os
import re
from typing import Optional

MODEL = os.getenv("PYQUEST_TUTOR_MODEL", "claude-haiku-4-5-20251001")
_KEY = os.getenv("ANTHROPIC_API_KEY")

try:
    import anthropic
    _client = anthropic.Anthropic(api_key=_KEY) if _KEY else None
except Exception:
    _client = None

SYSTEM = (
    "You are Py, a cheerful cartoon snake who tutors kids aged 8-14 learning Python. "
    "Speak warmly, simply, and SHORT (2-4 sentences max). Use a fun emoji. "
    "NEVER give the complete code answer on the first hint — give ONE small nudge or a "
    "guiding question. Encourage effort. If the child seems stuck after trying, give a "
    "slightly bigger hint, but still let them type the final code themselves."
)


def _rule_based(prompt: str, code: str, error: Optional[str], attempts: int) -> str:
    code_l = (code or "").lower()
    if error:
        if "indentationerror" in error.lower() or "expected an indented block" in error.lower():
            return "🐍 Almost! Lines inside an `if`, `for`, or `def` need to be pushed in 4 spaces. Try indenting the line under it!"
        if "syntaxerror" in error.lower():
            return "🐍 Tiny typo somewhere! Check for a missing `:` at the end of an if/for/def line, or a missing quote on a string."
        if "nameerror" in error.lower():
            m = re.search(r"name '(\w+)'", error)
            who = m.group(1) if m else "that name"
            return f"🐍 Python doesn't know `{who}` yet. Did you spell it the same way when you created it? Make sure it has a value first!"
        if "typeerror" in error.lower() and "str" in error.lower():
            return "🐍 You can't glue a number directly to words with `+`. Wrap the number in `str(...)` first! 🎉"
        return "🐍 Don't worry, every coder hits errors! Read the last line of the red message — it usually points to the line number."
    # No error: nudge toward the goal
    if "print" not in code_l and "print" in prompt.lower():
        return "🐍 Remember to use `print(...)` to show your answer on screen!"
    if attempts == 0:
        return "🐍 Great start! Read the goal once more and try running your code — I'll help if something looks off. You've got this! 🌟"
    if attempts == 1:
        return "🐍 Getting closer! Compare your output to what the goal asks for — even a tiny space or capital letter matters."
    return "🐍 You're working hard! Look at the example just above the playground — your code can follow the same shape. 💪"


def hint(prompt: str, code: str = "", error: Optional[str] = None,
         attempts: int = 0, lesson_title: str = "") -> dict:
    """Return {'text': str, 'source': 'claude'|'rules'}."""
    if not _client:
        return {"text": _rule_based(prompt, code, error, attempts), "source": "rules"}
    user = (
        f"Lesson: {lesson_title}\nGoal: {prompt}\nAttempts so far: {attempts}\n"
        f"Kid's code:\n```python\n{code}\n```\n"
        + (f"Error they got:\n{error}\n" if error else "No error — they want a hint.\n")
        + "Give ONE short, kid-friendly hint (not the full answer)."
    )
    try:
        msg = _client.messages.create(
            model=MODEL, max_tokens=160, system=SYSTEM,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
        return {"text": text or _rule_based(prompt, code, error, attempts), "source": "claude"}
    except Exception:
        return {"text": _rule_based(prompt, code, error, attempts), "source": "rules"}
