const { spawn } = require("child_process");

export function runCommandShell(
    command: string,
    timeoutMs?: number
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(command, { shell: true });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
        child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

        let finished = false;
        child.on("close", (code: number | null) => {
            if (finished) return;
            finished = true;
            resolve({ exitCode: code, stdout, stderr });
        });

        if (timeoutMs) {
            setTimeout(() => {
                if (!finished) {
                    child.kill("SIGKILL");
                    finished = true;
                    resolve({
                        exitCode: null,
                        stdout,
                        stderr: stderr + "\nTimed out",
                    });
                }
            }, timeoutMs);
        }
    });
}
