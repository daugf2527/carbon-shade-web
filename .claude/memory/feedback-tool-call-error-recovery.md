---
name: tool-call-error-recovery
description: When tools return InputValidationError, stop and check schema instead of retrying
type: feedback
originSessionId: 17ebe8ff-25f0-4d89-bc17-3f6b90d78996
---
When a tool returns `InputValidationError` with "unexpected parameter", immediately stop retrying and inspect the tool schema to correct the call. Never repeat the same failing call pattern.

**Why:** During a multi-hour CI automation implementation session, `TaskList` was called ~15+ times with an extra `"content"` parameter. The tool accepts zero parameters (`properties: {}`), but the pattern from `TaskCreate`/`TaskUpdate` (which do take parameters) was carried over incorrectly. The error message was explicit each time, but it was ignored in favor of mechanical retries.

Additional failures from the same root cause:
- `TaskUpdate` called with `"content"` instead of the required `"taskId"`
- `Bash` called with `"content": "{}"` instead of `"command"`

**How to apply:** Before ANY tool call, mentally verify the required parameters. When `InputValidationError` fires, read the error completely and check the tool schema before the next attempt. Do not retry with minor variations of the same wrong pattern — fix the root cause.
