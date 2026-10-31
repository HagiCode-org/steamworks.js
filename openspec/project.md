# Project Context

## Purpose
steamworks.js is a modern Steamworks SDK implementation for HTML/JS and Node.js applications. It serves as a replacement for the deprecated greenworks library, providing:

- Pre-built binaries (no need for users to build native modules)
- Full TypeScript type definitions
- Promise-based API design instead of callbacks
- Electron support with Steam Overlay integration
- Cross-platform support (Windows, Linux, macOS)

## Tech Stack
- **Languages**: Rust (native layer), JavaScript/TypeScript (API layer)
- **Build Tools**:
  - `@napi-rs/cli` - N-API Rust bindings
  - Cargo - Rust package manager
  - TypeScript compiler
  - `cargo-xwin` - Windows cross-compilation on Linux
- **Core Dependencies**:
  - `steamworks-rs` - Rust bindings to Steamworks SDK (vendored at `vendor/steamworks-rs`)
  - `napi 2.16.x` - Node.js native addon framework
  - `tokio` - Async runtime
  - `serde/serde_json` - Serialization

## Project Conventions

### Code Style
- **JavaScript/TypeScript**:
  - Prettier configuration: single quotes, trailing commas, LF line endings
  - Print width: 140, tab width: 4
  - No semicolons, consistent quote props
- **Rust**:
  - Use `cargo fmt` for formatting
  - Use `cargo clippy` for linting
  - Run `pnpm run format` to apply both

### Architecture Patterns
- **N-API based**: Rust implementation exposed to Node.js via N-API
- **Async/Promise-based**: Modern async API design instead of callback patterns
- **Module structure**: Each Steam API feature has its own module under `src/api/`
- **Type safety**: Full TypeScript definitions in `client.d.ts` and `index.d.ts`
- **Vendored dependencies**: `steamworks-rs` is vendored at `vendor/steamworks-rs` as a git submodule

### Testing Strategy
- Manual testing with real Steam API (test files in `test/` directory)
- Electron integration tests in `test/electron/`
- TypeScript type checking tests (`test/typescript/`)
- CI runs TypeScript smoke test on push/PR
- Tests cover: auth, callbacks, matchmaking, networking, workshop, overlay, etc.

### Git Workflow
- Main branch: `main`
- PR-based workflow for contributions
- Commit messages follow conventional format
- Submodules: `vendor/steamworks-rs` must be checked out recursively

## Domain Context

### Steam API Integration
This project provides JavaScript bindings to Valve's Steamworks API, covering:
- **Achievements** - Unlock and manage Steam achievements
- **Auth** - Steam authentication and ticket handling
- **Apps** - Application info and metrics
- **Callbacks** - Event-based Steam callbacks
- **Cloud** - Steam Cloud storage
- **Input** - Steam Input API
- **Matchmaking** - Lobby and matchmaking system
- **Networking** - P2P networking via Steam
- **Workshop** - Steam Workshop integration

### Key Concepts
- **Steam Client** - Must be running for Steam API to function
- **App ID** - Each Steam app has a unique identifier (steam_appid.txt)
- **Steam Overlay** - In-game overlay browser and UI
- **Callbacks** - Steam sends async callbacks for events

## Important Constraints

### Platform Support
- Windows (x64) - Built via cargo-xwin cross-compilation
- Linux (x64) - Built on ubuntu:20.04 for glibc 2.31 compatibility
- macOS (x64, ARM64) - Built on macos-latest
- Node.js 14+ required

### Steam Requirements
- Steam must be running for most API calls
- Valid Steam app ID required (via `steam_appid.txt` or environment)
- Some features require the app to be downloaded/purchased via Steam

### Electron Specifics
- Steam Overlay requires special Electron configuration
- Context isolation considerations for preload scripts

### Build System
- **Windows builds**: Cross-compiled on Linux using ubuntu:20.04 container + cargo-xwin
- **Linux builds**: Built on ubuntu:20.04 for maximum glibc compatibility
- **macOS builds**: Native compilation on macOS runners
- **Parallel builds**: Linux and Windows targets build in parallel

## External Dependencies

### Steamworks SDK
- Proprietary SDK from Valve Corporation
- Access requires Steamworks agreement
- Version managed via git submodule at `vendor/steamworks-rs`
- Commit: `9841b63357c9b97508a567f207f03ca7c6d17e8a`

### Steam Client
- Required to be running for API access
- Provides authentication and overlay functionality

### Platform-Specific
- Windows: MSVC CRT (cached via GitHub Actions)
- Linux: GCC/Clang, glibc 2.31
- macOS: Xcode command line tools

## CI/CD

### GitHub Actions
- **Publish workflow** (`.github/workflows/publish.yml`):
  - Runs on push to `main`, tags (`v*`), and PRs
  - Builds for Windows, Linux, macOS in parallel
  - Publishes to npm with automated versioning
  - Release builds push `latest` tag, dev builds push `dev` tag
- **TypeScript Smoke Test** (`.github/workflows/typescript-smoke-test.yml`):
  - Runs TypeScript compilation check
  - Validates type definitions

### Versioning
- Tags: `v*` (e.g., `v1.0.0`) trigger release builds
- Dev versions: `<base-version>-dev.<commit-count>`
- Package name: `@ducky7go/steamworks.js` (public access)
