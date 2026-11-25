// Error types the router turns into exit codes. A usage error (bad arguments) exits 2; a command failure or a refused
// write exits 1. Both print their message to standard error.

export const EXIT_OK = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2

export class UsageError extends Error {
    constructor(message) {
        super(message)
        this.name = 'UsageError'
        this.exitCode = EXIT_USAGE
    }
}

export class CommandError extends Error {
    constructor(message, { exitCode = EXIT_FAILURE } = {}) {
        super(message)
        this.name = 'CommandError'
        this.exitCode = exitCode
    }
}
