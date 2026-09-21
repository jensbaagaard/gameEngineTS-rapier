# How we implement features and changes

The engine must be of the highest quality with the minimum amount of code. That matters more than finishing a task.

## Code

- Keep the codebase minimal. Every line must earn its place.
- No comments. Names and structure carry the meaning.
- Strike the balance between clean, readable code and the fewest lines. Neither wins alone.
- Delete what a change makes unnecessary: dead code, no-op overrides, indirection that no longer pays for itself.

## Finishing a task

- Never write subpar code to please the user or to complete a task.
- If a change cannot meet this standard, omit it and tell the user exactly what was left out and why.
- Partial work done well beats complete work done poorly.
