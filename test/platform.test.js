const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Android omits header backup help while browsers retain it", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const start = source.indexOf('  const saveActions = document.querySelector("header .actions");');
  const end = source.indexOf("  const categoryMeta =", start);
  assert.ok(start >= 0 && end > start);
  for (const isAndroid of [true, false]) {
    const children = [];
    vm.runInNewContext(source.slice(start, end), {
      platform: { isAndroid },
      document: {
        querySelector: () => ({ append: (element) => children.push(element) }),
        createElement: () => ({}),
      },
    });
    assert.equal(children.length, isAndroid ? 0 : 1);
    if (!isAndroid) assert.match(children[0].innerHTML, /backup/);
  }
});

function setup(android, language = "en-US", device = {}) {
  const messages = [];
  const values = new Map();
  const events = [];
  const context = {
    navigator: { language, ...device },
    window: {
      confirm: () => true,
      AndroidBudget: {
        postMessage: (value) => messages.push(JSON.parse(value)),
      },
      dispatchEvent: (event) => events.push(event),
    },
    location: { search: android ? "?android=1" : "" },
    URLSearchParams,
    document: { documentElement: { classList: { toggle() {} } } },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/platform.js"), "utf8"),
    context,
  );
  return {
    platform: context.window.budgetPlatform,
    messages,
    values,
    events,
    context,
  };
}

test("browser adapter keeps the existing storage key", async () => {
  const { platform, values } = setup(false);
  assert.equal(await platform.load(), null);
  await platform.save("budget");
  assert.equal(values.get("MyBudgeter-save-v1"), "budget");
  assert.equal(await platform.load(), "budget");
});

test("phone browsers use the mobile interface without enabling native storage", async () => {
  for (const device of [
    { userAgent: "Mozilla Android Mobile" },
    { userAgent: "Mozilla iPhone" },
    { userAgent: "Mozilla Macintosh", maxTouchPoints: 5 },
    { userAgentData: { mobile: true } },
  ]) {
    const { platform, values, messages } = setup(false, "en-US", device);
    assert.equal(platform.isMobile, true);
    assert.equal(platform.isAndroid, false);
    await platform.save("browser budget");
    assert.equal(await platform.load(), "browser budget");
    assert.equal(values.get("MyBudgeter-save-v1"), "browser budget");
    assert.equal(messages.length, 0);
  }
  assert.equal(setup(false, "en-US", { userAgent: "Mozilla Windows", maxTouchPoints: 5 }).platform.isMobile, false);
  assert.equal(setup(false).platform.isMobile, false);
  assert.equal(setup(false, "en-US", { userAgent: "Mozilla Windows NT", userAgentData: { mobile: true } }).platform.isMobile, false);
  assert.equal(setup(true).platform.isMobile, true);
});

test("Android saves resolve only after native acknowledgement and surface failures", async () => {
  const { platform, messages } = setup(true);
  let acknowledged = false;
  const saved = platform.save("budget").then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  assert.equal(acknowledged, false);
  const request = messages[0];
  assert.equal(request.operation, "save");
  assert.equal(request.value, "budget");
  platform.receive({ id: request.id, value: true });
  await saved;
  assert.equal(acknowledged, true);
  const failed = platform.save("next");
  platform.receive({ id: messages[1].id, error: "Disk full" });
  await assert.rejects(failed, /Disk full/);
});

test("Android currency metadata comes from the native locale operation", async () => {
  const { platform, messages } = setup(true);
  const pending = platform.displayCurrency();
  assert.equal(messages[0].operation, "displayCurrency");
  platform.receive({ id: messages[0].id, value: { locale: "en-GB", currency: "GBP" } });
  assert.deepEqual(await pending, { locale: "en-GB", currency: "GBP" });
});

test("browser currency follows explicit regions, inferred languages, and safe fallbacks", async () => {
  for (const [language, currency] of [
    ["en-US", "USD"],
    ["en-GB", "GBP"],
    ["fr-CA", "CAD"],
    ["de-DE", "EUR"],
    ["fr", "EUR"],
    ["ja-JP", "JPY"],
    ["bg-BG", "EUR"],
    ["en-AU", "AUD"],
    ["zh-Hant", "TWD"],
    ["en-001", "USD"],
    ["invalid_locale", "USD"],
  ]) {
    const { platform, messages } = setup(false, language);
    assert.equal((await platform.displayCurrency()).currency, currency);
    assert.equal(messages.length, 0);
  }
  const { platform, context } = setup(false, "en-GB");
  context.Intl = { Locale: undefined };
  assert.equal((await platform.displayCurrency()).currency, "USD");
});

test("Android backup dialogs cancel before pickers or allow confirmed operations", async () => {
  for (const operation of ["import", "export"]) {
    const { platform, context, messages } = setup(true);
    const prompts = [];
    context.window.confirm = (message) => { prompts.push(message); return false; };
    const run = () => operation === "import"
      ? platform.importFile() : platform.exportFile("budget backup");
    assert.equal(await run(), null);
    assert.equal(messages.length, 0);
    assert.match(prompts[0], operation === "import" ? /replaces your current budget/ : /JSON backup/);
    context.window.confirm = () => true;
    const confirmed = run();
    assert.equal(messages[0].operation, operation);
    if (operation === "export") assert.equal(messages[0].value, "budget backup");
    platform.receive({ id: messages[0].id, operation, value: null });
    assert.equal(await confirmed, null);
  }
});

test("canceled native file selection resolves without a payload", async () => {
  const { platform, messages } = setup(true);
  const selected = platform.importFile();
  platform.receive({ id: messages[0].id, operation: "import", value: null });
  assert.equal(await selected, null);
});

test("picker results after activity recreation are delivered as events", () => {
  const { platform, events } = setup(true);
  platform.receive({
    id: "previous-activity",
    operation: "import",
    value: "budget",
  });
  assert.equal(events[0].type, "budget-document-result");
  assert.equal(events[0].detail.value, "budget");
});

test("missing Android bridge fails with update instructions", async () => {
  const { platform, context } = setup(true);
  delete context.window.AndroidBudget;
  await assert.rejects(platform.load(), /Update Android System WebView/);
});
