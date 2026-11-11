# Contributing to steamworks.js

Thank you for your interest in contributing to steamworks.js!

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate release notes generation through [hagi-release-drafter](https://github.com/HagiCode-org/hagi-release-drafter). A commit whose subject contains `skip-release-notes` is left out of the notes. Please format your commit messages according to these conventions:

### Commit Message Format

```
<type>: <description>

[optional body]

[optional footer]
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat: add Steam Input API support` |
| `fix` | Bug fix | `fix: resolve crash on Linux startup` |
| `docs` | Documentation changes | `docs: update README installation guide` |
| `style` | Code style changes (formatting) | `style: apply prettier formatting` |
| `refactor` | Code refactoring | `refactor: simplify achievement module` |
| `perf` | Performance improvements | `perf: optimize callback processing` |
| `test` | Test additions or changes | `test: add achievement activation tests` |
| `build` | Build system changes | `build: upgrade to napi-rs v3` |
| `ci` | CI configuration changes | `ci: add macOS ARM build to workflow` |

### Breaking Changes

For breaking API changes, put `!` after the type or scope (`feat!:`) or add a `BREAKING CHANGE:` footer to the commit body. Pull request labels are not used for release notes:

```
feat: change client.init() return type

BREAKING CHANGE: client.init() now returns a promise instead of the client directly
```

### Examples

```
feat: add Steam Workshop upload support

This adds the ability to upload workshop items including
screenshots and metadata.

fix: prevent memory leak in callback handler

The previous implementation didn't clean up callbacks properly
when the client was destroyed.

docs: clarify Electron overlay setup requirements

ci: enable caching for Rust dependencies
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes following the commit conventions above
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
5. Push to the branch (`git push origin feat/amazing-feature`)
6. Open a Pull Request

## Release Process

This project uses automated release management:

- **Pre-releases**: Automatically created on each push to the `main` branch
- **Official releases**: Created when a version tag is pushed (e.g., `v1.2.3`)

Release notes are automatically generated from your commit messages, so using proper commit conventions is important!
