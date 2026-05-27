---
name: firecrawl-mcp-tool-parameter-format
description: Correct parameter format for Firecrawl MCP tools — sources must be array of objects, scrapeOptions.formats must be array
type: feedback
originSessionId: a8b077db-e304-472c-98c4-71a906f7a27b
---
Always pass Firecrawl MCP tool parameters in these exact formats:

**firecrawl_search:**
- `sources`: MUST be an **array** of objects — `[{ type: "web" }]`, NOT `{ type: "web" }`.
- `scrapeOptions.formats`: MUST be an **array** — `["markdown"]`, NOT `"markdown"`.

**Why:** The tool schema defines these as `type: "array"` with `items` of type `"object"` or `"string"`. Passing a bare object or string fails with "expected array, received object/string."

**How to apply:** Whenever calling `mcp__mcp-server-firecrawl__firecrawl_search`, always wrap sources in `[]` and formats in `[]`. If you see MCP error -32602 about parameter validation, check array vs. object/string first.