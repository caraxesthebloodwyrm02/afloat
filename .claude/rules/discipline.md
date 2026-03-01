# Development Discipline

Applies to: all work in this repository.

## Session Start Protocol

Before writing ANY new code in a session, run:
```
npm run test && npm run lint
```
If tests fail, fix them before doing anything else.

## Commit Discipline

- One commit, one concern. Security fixes separate from features separate from refactoring.
- Use conventional commits: `fix(auth):`, `feat(session):`, `refactor(api):`, `test(billing):`, `docs:`
- Always verify tests pass before committing.

## Complexity Check

Before adding a new abstraction, ask:
1. Does a similar abstraction already exist in the codebase?
2. Can this be done with existing patterns instead?
3. Will this be tested? If not testable, it shouldn't exist.
