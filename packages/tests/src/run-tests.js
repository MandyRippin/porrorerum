import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const WAKUNODE_IMAGE =
  process.env.WAKUNODE_IMAGE || "statusteam/nim-waku:v0.17.0";

async function main() {
  try {
    await execAsync(`docker inspect ${WAKUNODE_IMAGE}`);
    console.log("Using local image");
  } catch (error) {
    console.log("Pulling image...");
    await execAsync(`docker pull ${WAKUNODE_IMAGE}`);
    console.log("Image pulled");
  }

  // Run mocha tests
  const mocha = spawn(
    "npx",
    [
      "mocha",
      "--require",
      "ts-node/register",
      "--project",
      "./tsconfig.dev.json",
    ],
    {
      stdio: "inherit",
    }
  );

  mocha.on("error", (error) => {
    console.log(`Error running mocha tests: ${error.message}`);
    process.exit(1);
  });

  mocha.on("exit", (code) => {
    console.log(`Mocha tests exited with code ${code}`);
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.log(error);
  process.exit(1);
});
