import { spawn } from "node:child_process";

const processes = [];

function run(command, args) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env
  });
}

function hasListener(port) {
  return new Promise((resolve) => {
    const checker = run("powershell", [
      "-NoProfile",
      "-Command",
      `$conn = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { 'true' }`
    ]);

    let output = "";
    checker.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });

    checker.on("exit", () => {
      resolve(output.toLowerCase().includes("true"));
    });
  });
}

function waitForBackendReady(timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/health");
        if (response.ok) {
          clearInterval(interval);
          resolve(true);
          return;
        }
      } catch {
        // keep waiting
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for backend to become ready"));
      }
    }, 1000);
  });
}

function stopAll() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(143);
});

const backendRunning = await hasListener(8000);
const frontendRunning = await hasListener(3003);

console.log("Starting services. Existing listeners will be reused.");

if (!backendRunning) {
  const backend = run("npm", ["run", "dev:backend"]);
  processes.push(backend);
  backend.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`backend exited with code ${code ?? 0}${signal ? ` signal ${signal}` : ""}`);
      stopAll();
      process.exit(code ?? 0);
    }
  });
} else {
  console.log("Backend already running on port 8000.");
}

await waitForBackendReady();

if (!frontendRunning) {
  const frontend = run("npm", ["run", "dev"]);
  processes.push(frontend);
  frontend.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`frontend exited with code ${code ?? 0}${signal ? ` signal ${signal}` : ""}`);
      stopAll();
      process.exit(code ?? 0);
    }
  });
} else {
  console.log("Frontend already running on port 3003.");
}
