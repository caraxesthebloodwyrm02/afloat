import { enforceSecretGovernance, scrubSecrets } from "@/lib/secrets";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] Step 1: Secret governance validation");
    enforceSecretGovernance();

    const gracefulShutdown = (signal: string) => {
      console.log(`[instrumentation] Step 2: Secret cleanup on ${signal}`);
      scrubSecrets();
      process.exit(0);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    process.on("beforeExit", () => {
      console.log("[instrumentation] Step 2: Secret cleanup on beforeExit");
      scrubSecrets();
    });

    process.on("uncaughtException", () => {
      console.error("[instrumentation] Uncaught exception, scrubbing secrets");
      scrubSecrets();
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[instrumentation] Unhandled rejection:", reason);
      scrubSecrets();
    });
  }
}