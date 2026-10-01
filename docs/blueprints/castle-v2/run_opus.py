"""Orchestrate the explicitly authorized Claude job; no design or rendering code."""
from datetime import datetime, timezone
import json
import argparse
from pathlib import Path
import subprocess
import threading

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--assignment', default='assignment.txt')
parser.add_argument('--tag', default='')
parser.add_argument('--local-only', action='store_true')
options = parser.parse_args()
if Path(options.assignment).name != options.assignment or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in options.tag):
    raise SystemExit('Assignment and tag must be local filenames')
prefix = options.tag + '-' if options.tag else ''
claude = r"C:\Users\kroen\.local\bin\claude.exe"
command = [
    claude, "--print", "--model", "opus[1m]", "--effort", "low",
    "--safe-mode", "--restricted", "--no-chrome", "--strict-mcp-config",
    "--mcp-config", str(root / "mcp-empty.json"),
    "--no-session-persistence", "--permission-mode", "dontAsk",
    "--permission-prompts", "none", "--output-format", "stream-json", "--verbose",
    "--tools", "Read,Glob,Grep,Write,Edit,Bash" if options.local_only else "Read,Glob,Grep,Write,Edit,Bash,WebSearch,WebFetch",
    "--allowedTools", "Read", "Glob", "Grep", "Write", "Edit",
    "Bash(python render.py)", "Bash(python validate.py)",
]
if not options.local_only:
    command.extend(['--allowedTools', 'WebSearch', 'WebFetch'])
status = {
    "started_at_utc": datetime.now(timezone.utc).isoformat(),
    "model_argument": "opus[1m]", "effort": "low (matching existing user settings)",
    "scope": "castle-v2 reviewable plans only", "status": "process-started",
    "ownership": "Opus authors all designs, SVGs, renderer, PNGs and visual repairs",
}
prompt = (root / options.assignment).read_text(encoding="utf-8")
process = subprocess.Popen(command, cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
status["pid"] = process.pid
(root / (prefix + "runner-status.json")).write_text(json.dumps(status, indent=2), encoding="utf-8")
print(json.dumps(status), flush=True)

def drain_errors():
    with (root / (prefix + "opus-stderr.log")).open("w", encoding="utf-8") as log:
        for line in process.stderr:
            log.write(line)
            log.flush()
            if line.strip():
                print("Claude stderr: " + line.strip()[:600], flush=True)

error_thread = threading.Thread(target=drain_errors, daemon=True)
error_thread.start()
process.stdin.write(prompt)
process.stdin.close()
with (root / (prefix + "opus-events.jsonl")).open("w", encoding="utf-8") as log:
    for line in process.stdout:
        log.write(line)
        log.flush()
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            print(line.strip()[:600], flush=True)
            continue
        event_type = event.get("type")
        if event_type == "system" and event.get("subtype") == "init":
            status["actual_model"] = event.get("model")
            status["session_id"] = event.get("session_id")
            status["status"] = "session-initialized"
            (root / (prefix + "runner-status.json")).write_text(json.dumps(status, indent=2), encoding="utf-8")
            print(json.dumps({"event": "session-initialized", "actual_model": event.get("model"), "session_id": event.get("session_id"), "tools": event.get("tools")}), flush=True)
        elif event_type == "assistant":
            for block in event.get("message", {}).get("content", []):
                if block.get("type") == "tool_use":
                    data = block.get("input", {})
                    target = data.get("file_path") or data.get("command") or data.get("query") or data.get("url") or ""
                    print("Opus tool: " + block.get("name", "") + " " + str(target)[:220], flush=True)
                elif block.get("type") == "text" and block.get("text"):
                    print("Opus: " + block["text"][:1400], flush=True)
        elif event_type == "result":
            (root / (prefix + "opus-result.json")).write_text(json.dumps(event, indent=2), encoding="utf-8")
            print(json.dumps({"event": "result", "subtype": event.get("subtype"), "is_error": event.get("is_error"), "result": event.get("result"), "permission_denials": event.get("permission_denials")}), flush=True)
return_code = process.wait()
error_thread.join(timeout=2)
status["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
status["exit_code"] = return_code
status["status"] = "finished" if return_code == 0 else "failed"
(root / (prefix + "runner-status.json")).write_text(json.dumps(status, indent=2), encoding="utf-8")
print(json.dumps(status), flush=True)
raise SystemExit(return_code)
