const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("FAQ has ten concise answers and opening a question closes the others", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const markup = source.slice(source.indexOf('  faqCard.innerHTML = `'), source.indexOf("  app?.append(faqCard);"));
  assert.equal((markup.match(/class="faq-question"/g) || []).length, 10);
  assert.equal((markup.match(/<p>/g) || []).length, 10);
  assert.ok(markup.includes("Download save file"));
  const questions = Array.from({ length: 10 }, () => ({
    open: false,
    addEventListener(event, listener) {
      assert.equal(event, "toggle");
      this.toggle = listener;
    },
  }));
  const wiring = source.slice(source.indexOf("  const faqQuestions ="), source.indexOf("  const faqDetails ="));
  vm.runInNewContext(wiring, {
    faqCard: { querySelectorAll: () => questions },
  });
  questions[0].open = true;
  questions[0].toggle();
  questions[9].open = true;
  questions[9].toggle();
  assert.deepEqual(questions.map(({ open }) => open), Array(9).fill(false).concat(true));
  questions[0].toggle();
  assert.equal(questions[9].open, true);
});

test("collapsing FAQ resets all questions before the section reopens", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const questions = [{ open: true }, { open: false }];
  const details = {
    open: false, isConnected: true,
    querySelector: () => ({}),
    addEventListener: (event, listener) => { details.toggle = listener; },
  };
  const state = { app: { isFaqOpen: true } };
  vm.runInNewContext(source.slice(source.indexOf("  const faqDetails ="), source.indexOf("  const categoryMeta =")), {
    faqCard: { querySelector: () => details }, faqQuestions: questions,
    state, platform: { isMobile: false }, saveState: () => {}, window: {},
  });
  details.open = false;
  details.toggle();
  assert.ok(questions.every((question) => !question.open));
  details.open = true;
  details.toggle();
  assert.ok(questions.every((question) => !question.open));
  assert.equal(state.app.isFaqOpen, true);
});

test("browser and Android display the My Budget brand", () => {
  assert.match(fs.readFileSync(path.join(__dirname, "../index.html"), "utf8"), /<title>My Budget<\/title>/);
  assert.match(fs.readFileSync(path.join(__dirname, "../android/app/src/main/res/values/strings.xml"), "utf8"), /name="app_name">My Budget<\/string>/);
});

test("desktop footer shows the shared version above copyright while mobile omits it", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const footerCode = source.slice(source.indexOf('  const footer = document.createElement("footer");'), source.indexOf("  if (categoryToFocus)", source.indexOf("function render(")));
  for (const isMobile of [false, true]) {
    let footer;
    vm.runInNewContext(footerCode, {
      platform: { isMobile }, budget: { APP_VERSION: "1.9.0" },
      document: { createElement: () => ({}) },
      app: { append: (element) => { footer = element; } },
    });
    assert.equal(footer.innerHTML.includes("My Budget v1.9.0"), !isMobile);
    assert.ok(footer.innerHTML.endsWith(`Michael Yeh <span aria-hidden="true">&copy;</span> ${new Date().getFullYear()}`));
    if (!isMobile) assert.ok(footer.innerHTML.indexOf("My Budget") < footer.innerHTML.indexOf("Michael Yeh"));
  }
});

test("shared action menus preserve budget labels, modal ownership and action callbacks", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mobile.js"), "utf8");
  for (const labels of [["Rename", "Duplicate", "Delete"], ["Edit", "×"]]) {
    const calls = [];
    const modal = { append: (menu) => { modal.menu = menu; } };
    const controls = labels.map((textContent, index) => ({
      textContent, disabled: index === 1, matches: () => true,
      click: () => calls.push(textContent),
    }));
    const actions = {
      children: controls, closest: () => modal,
      append: (toggle) => { actions.toggle = toggle; },
    };
    const context = {
      window: { innerWidth: 500, innerHeight: 800 },
      menuToggle: null, actionMenu: null,
      closeActionMenu: () => { context.menuToggle = null; },
      document: {
        createElement: () => ({
          attributes: {}, children: [], offsetWidth: 160, offsetHeight: 160, style: {},
          setAttribute(name, value) { this.attributes[name] = value; },
          append(child) { this.children.push(child); },
          getBoundingClientRect: () => ({ top: 100, bottom: 132, right: 400 }),
          querySelector() { return this.children.find((child) => !child.disabled); },
          focus() {},
        }),
      },
    };
    vm.runInNewContext(source.slice(source.indexOf("  function addActionMenu("), source.indexOf('  document.addEventListener("click",')), context);
    context.addActionMenu(actions, "Main Budget");
    assert.ok(controls.every((control) => control.hidden));
    assert.equal(actions.toggle.attributes["aria-label"], "Actions for Main Budget");
    actions.toggle.onclick();
    assert.deepEqual(modal.menu.children.map((option) => option.textContent), labels.map((label) => label === "×" ? "Remove" : label));
    assert.equal(modal.menu.attributes.role, "menu");
    assert.equal(modal.menu.children[1].disabled, true);
    modal.menu.children[0].onclick();
    assert.deepEqual(calls, [labels[0]]);
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

test("browser draft recovery persists separately from single-budget backups and the library", async () => {
  const { platform, values } = setup(false);
  assert.equal(await platform.loadSession(), null);
  await platform.save("library");
  await platform.saveSession("draft sessions");
  assert.equal(values.get("MyBudgeter-save-v1"), "library");
  assert.equal(await platform.loadSession(), "draft sessions");
});

test("native document requests carry their originating budget identity", async () => {
  const { platform, messages } = setup(true);
  const imported = platform.importFile("original-budget");
  assert.equal(messages[0].budgetId, "original-budget");
  platform.receive({ id: messages[0].id, value: null });
  await imported;
  const exported = platform.exportFile("single-budget", "another-budget");
  assert.equal(messages[1].budgetId, "another-budget");
  assert.equal(messages[1].value, "single-budget");
  platform.receive({ id: messages[1].id, value: true });
  await exported;
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
    assert.match(prompts[0], operation === "import" ? /replace the active budget/ : /backup of the selected budget/);
    if (operation === "export") assert.match(prompts[0], /budgets autosave on this device/);
    context.window.confirm = () => true;
    const confirmed = run();
    assert.equal(messages[0].operation, operation);
    if (operation === "export") assert.equal(messages[0].value, "budget backup");
    platform.receive({ id: messages[0].id, operation, value: null });
    assert.equal(await confirmed, null);
  }
});

test("Android new-budget imports explain creation and retain their request context", async () => {
  const { platform, context, messages } = setup(true);
  let prompt;
  context.window.confirm = (message) => { prompt = message; return true; };
  const request = 'new-budget:{"id":"new-one","name":"Restored"}';
  const result = platform.importFile(request);
  assert.match(prompt, /create a new budget/);
  assert.equal(prompt.includes("replace"), false);
  assert.equal(messages[0].budgetId, request);
  platform.receive({ id: messages[0].id, operation: "import", value: null });
  assert.equal(await result, null);
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
