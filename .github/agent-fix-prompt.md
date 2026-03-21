Fix the current pull request branch inside the Afloat repository.

Constraints:

- Work only on this PR branch.
- Do not merge or rebase.
- Preserve the existing Next.js app behavior unless the PR requires a change.
- Run only the trusted validation command after making changes.

Focus on restoring green checks with minimal scope.
