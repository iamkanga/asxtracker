---
description: Turbo Boost Workflow
---

// turbo-all

1. Use native tools (like `replace_file_content`, `multi_replace_file_content`, and `grep_search`) as much as possible, as these execute instantly and do not require user approval.
2. When a terminal command (`run_command`) is absolutely necessary, use the `// turbo-all` directive to automatically set `SafeToAutoRun: true` and execute the command without bothering the user.
3. Process tasks in large, logical batches to minimize the total number of actions and speed up the development process.
