# Contributing

Thanks for your interest in Keystone.

## Local development

```bash
bun install
bun run check
```

`bun run check` runs:
- typecheck
- unit tests
- smoke tests against the fixture workspace

## Making changes

- keep the manifest format small and explicit
- prefer improving shared primitives over adding one-off adapters
- add or update tests for behavior changes
- avoid exposing secret-marked env vars in public outputs

## Before opening a PR

Run:

```bash
bun run check
```

If you change CLI behavior or the manifest contract, also update `README.md`.
