## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists and you do not yet know which files matter, check the graph before your first grep or source-file read, and put this rule in every subagent prompt that explores code. Keep it cheap: prefer `graphify explain "<symbol>"` (one node and its neighbours) and `graphify path "<A>" "<B>"` (one relationship); use `graphify query "<question>" --budget 600` only for broad questions, never without `--budget`. Then read only the lines the graph located.
- Skip the graph when the task already names the exact file or symbol: open it directly.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- The graph covers src/ only (see .graphifyignore). graphify-out/ is git-ignored: if it is missing, build it with `graphify update .`.
