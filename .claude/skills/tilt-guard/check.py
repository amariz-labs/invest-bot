#!/usr/bin/env python3
"""
tilt-guard PreToolUse hook.

Reads data/state.yaml (written by /pre-trade-checklist) and the optional
data/tilt.yaml (written by /tilt-guard score). Exits 0 to allow the tool
call, exits 2 to BLOCK it (Claude Code's contract for hard-fail).

Fail-CLOSED on every uncertainty:
  - state.yaml missing → BLOCK ("haven't run /pre-trade-checklist today")
  - state.yaml unparseable → BLOCK ("corrupt; rerun checklist")
  - updated_at missing or > MCP_STATE_MAX_AGE_MS (default 4h) → BLOCK
  - status == "BLOCKED" → BLOCK
  - trade_today is false → BLOCK
  - tilt_score >= tilt_threshold → BLOCK

Pass cases (exit 0):
  - All checks above pass.
  - data/journal/overrides/<TS>.md exists for the current minute (escape hatch
    for documented overrides; the override file itself is what gets audited).

Designed to be invoked by Claude Code's hook system via
profiles/day-trading/.claude/settings.json. See SECURITY.md and
.claude/skills/tilt-guard/SKILL.md.
"""

from __future__ import annotations

import os
import sys
import json
import time
from datetime import datetime, timezone
from pathlib import Path

# --------------------------------------------------------------------------
# Locate repo root. The hook is invoked from arbitrary cwd; we walk up from
# this file's location. .claude/skills/tilt-guard/check.py is 3 levels deep.
# Override via TILT_GUARD_REPO_ROOT for non-standard layouts.
# --------------------------------------------------------------------------
ROOT_OVERRIDE = os.environ.get("TILT_GUARD_REPO_ROOT")
if ROOT_OVERRIDE:
    REPO = Path(ROOT_OVERRIDE).resolve()
else:
    REPO = Path(__file__).resolve().parents[3]

STATE_YAML = REPO / "data" / "state.yaml"
OVERRIDES_DIR = REPO / "data" / "journal" / "overrides"
MAX_AGE_S = int(os.environ.get("MCP_STATE_MAX_AGE_MS", str(4 * 60 * 60 * 1000))) // 1000


def emit(decision: str, reason: str = "", extra: dict | None = None) -> None:
    """Write a single-line JSON record to stderr for audit + exit accordingly.

    Claude Code's hook contract: exit 0 to allow, exit 2 (any non-zero) to block.
    We use stderr because stdout would interleave with tool output.
    """
    msg = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "hook": "tilt-guard",
        "decision": decision,
        "reason": reason,
        "state_yaml": str(STATE_YAML),
    }
    if extra:
        msg.update(extra)
    sys.stderr.write(json.dumps(msg) + "\n")
    sys.stderr.flush()
    sys.exit(0 if decision == "allow" else 2)


def parse_yaml_min(text: str) -> dict[str, object]:
    """Tiny YAML reader: top-level `key: value` scalars only. Avoids a PyYAML
    dep for the hook. Matches the parser in mcp/src/gates.ts."""
    out: dict[str, object] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, raw = line.partition(":")
        key = key.strip()
        raw = raw.strip()
        if "#" in raw:
            raw = raw.split("#", 1)[0].strip()
        if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
            raw = raw[1:-1]
        if raw in ("true", "True"):
            out[key] = True
        elif raw in ("false", "False"):
            out[key] = False
        elif raw == "":
            out[key] = ""
        else:
            try:
                out[key] = float(raw) if "." in raw else int(raw)
            except ValueError:
                out[key] = raw
    return out


def has_recent_override() -> bool:
    """Check for a logged override within the current UTC minute."""
    if not OVERRIDES_DIR.exists():
        return False
    now_min = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    for child in OVERRIDES_DIR.iterdir():
        if child.is_file() and now_min in child.name:
            return True
    return False


def main() -> None:
    if not STATE_YAML.exists():
        emit("block", "state.yaml missing — run /pre-trade-checklist first")

    try:
        state = parse_yaml_min(STATE_YAML.read_text(encoding="utf-8"))
    except OSError as e:
        emit("block", f"state.yaml unreadable: {e}")

    # Staleness check.
    updated_at_raw = state.get("updated_at")
    if not updated_at_raw:
        if has_recent_override():
            emit("allow", "override present despite missing updated_at",
                 extra={"override_in_minute": True})
        emit("block", "state.yaml has no updated_at — re-run /pre-trade-checklist")

    try:
        # Accept both YYYY-MM-DDTHH:MM:SSZ and integer epoch.
        if isinstance(updated_at_raw, (int, float)):
            updated_at_s = float(updated_at_raw)
        else:
            updated_at_s = datetime.fromisoformat(str(updated_at_raw).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        emit("block", f"state.yaml updated_at is unparseable: {updated_at_raw!r}")

    age_s = time.time() - updated_at_s
    if age_s > MAX_AGE_S:
        emit(
            "block",
            f"state.yaml is {age_s/3600:.1f}h old, threshold {MAX_AGE_S/3600:.1f}h",
            extra={"age_seconds": int(age_s), "max_age_seconds": MAX_AGE_S},
        )

    # Explicit BLOCKED states.
    status = str(state.get("status", "")).upper()
    if status == "BLOCKED":
        emit("block", "state.status=BLOCKED by pre-trade-checklist")

    if state.get("trade_today") is False:
        emit("block", "state.trade_today=false — no trades today")

    # Tilt-score check (optional; only enforced if both fields present).
    tilt_score = state.get("tilt_score")
    tilt_threshold = state.get("tilt_threshold", 0.7)
    if isinstance(tilt_score, (int, float)) and isinstance(tilt_threshold, (int, float)):
        if tilt_score >= tilt_threshold:
            if has_recent_override():
                emit("allow",
                     f"tilt_score {tilt_score} >= {tilt_threshold} but override logged this minute",
                     extra={"tilt_score": tilt_score, "tilt_threshold": tilt_threshold, "override_in_minute": True})
            emit("block",
                 f"tilt_score {tilt_score} >= threshold {tilt_threshold}",
                 extra={"tilt_score": tilt_score, "tilt_threshold": tilt_threshold})

    # All gates passed.
    emit("allow", "all gates passed",
         extra={"status": status, "trade_today": state.get("trade_today"),
                "tilt_score": tilt_score, "age_seconds": int(age_s)})


if __name__ == "__main__":
    main()
