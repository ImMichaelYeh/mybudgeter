const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("version hook allows feature commits and checks only pushes targeting main", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mybudget-version-hook-"));
  const repository = path.join(directory, "work");
  const remote = path.join(directory, "remote.git");
  const hooks = path.join(directory, "hooks");
  fs.mkdirSync(repository);
  fs.mkdirSync(hooks);
  fs.copyFileSync(path.resolve(__dirname, "../.githooks/pre-push"), path.join(hooks, "pre-push"));
  fs.chmodSync(path.join(hooks, "pre-push"), 0o755);
  const git = (...args) => spawnSync("git", args, {
    cwd: repository, encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const succeed = (...args) => {
    const result = git(...args);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  const commit = (version, message) => {
    fs.writeFileSync(path.join(repository, "src/budget.js"), `const APP_VERSION = "${version}";\n// ${message}\n`);
    succeed("add", "src/budget.js");
    succeed("commit", "-m", message);
  };
  const blocked = (message) => {
    const result = git("push", "origin", "feature:main");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  };

  try {
    succeed("init", "--bare", remote);
    succeed("init", "--initial-branch=main");
    succeed("config", "user.name", "Version Hook Test");
    succeed("config", "user.email", "version-hook@example.invalid");
    succeed("config", "core.hooksPath", hooks.replaceAll("\\", "/"));
    succeed("remote", "add", "origin", remote);
    fs.mkdirSync(path.join(repository, "src"));
    commit("1.9.0", "Initial main");
    succeed("push", "origin", "main");

    succeed("checkout", "-b", "feature");
    commit("1.9.0", "Feature without a version bump");
    succeed("push", "origin", "feature");
    blocked(/increase APP_VERSION above 1\.9\.0/);

    commit("1.9.0", "Another feature commit without a bump");
    succeed("push", "origin", "feature");
    commit("1.9.1", "One patch bump for the main push");
    commit("1.9.1", "Final feature polish keeps the release version");
    succeed("push", "origin", "feature:main");

    commit("1.9.1", "Next feature iteration");
    succeed("push", "origin", "feature");
    blocked(/increase APP_VERSION above 1\.9\.1/);
    commit("1.8.99", "A downgrade is not a bump");
    blocked(/increase APP_VERSION above 1\.9\.1/);
    commit("1.10.0", "Minor bump compares numerically");
    succeed("push", "origin", "feature:main");
    commit("2.0.0", "Major bump permits a lower minor component");
    succeed("push", "origin", "feature:main");
    commit("invalid", "Reject malformed release versions");
    blocked(/must use major\.minor\.patch/);

    commit("2.0.1", "Valid version for unavailable remote check");
    const unavailable = spawnSync(process.execPath, [path.join(hooks, "pre-push")], {
      cwd: repository, encoding: "utf8",
      input: `refs/heads/feature ${succeed("rev-parse", "HEAD")} refs/heads/main ${"f".repeat(40)}\n`,
    });
    assert.notEqual(unavailable.status, 0);
    assert.match(unavailable.stderr, /Fetch the remote main branch/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("mybudget-version-hook-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
