(() => {
  const isAndroid = new URLSearchParams(location.search).get("android") === "1";
  const requests = new Map();
  let sequence = 0;
  const storageKey = "MyBudgeter-save-v1";

  function request(operation, value) {
    return new Promise((resolve, reject) => {
      if (!window.AndroidBudget) {
        reject(new Error("Update Android System WebView and reopen the app."));
        return;
      }
      const id = `${Date.now()}-${++sequence}`;
      requests.set(id, { resolve, reject });
      try {
        window.AndroidBudget.postMessage(
          JSON.stringify({ id, operation, value }),
        );
      } catch (error) {
        requests.delete(id);
        reject(error);
      }
    });
  }

  window.budgetPlatform = {
    isAndroid,
    load: () =>
      isAndroid
        ? request("load")
        : Promise.resolve(localStorage.getItem(storageKey)),
    save: (value) =>
      isAndroid
        ? request("save", value)
        : Promise.resolve(localStorage.setItem(storageKey, value)),
    importFile: () => request("import"),
    exportFile: (value) => request("export", value),
    loadSession: () =>
      isAndroid ? request("loadSession") : Promise.resolve(null),
    saveSession: (value) => request("session", value),
    ready: () => (isAndroid ? request("ready") : Promise.resolve()),
    receive(response) {
      const pending = requests.get(response.id);
      if (pending) {
        requests.delete(response.id);
        if (response.error) pending.reject(new Error(response.error));
        else pending.resolve(response.value);
      } else if (
        response.operation === "import" ||
        response.operation === "export"
      ) {
        // A document picker can return after Android has recreated the activity.
        window.dispatchEvent(
          new CustomEvent("budget-document-result", { detail: response }),
        );
      }
    },
  };
  document.documentElement.classList.toggle("android-app", isAndroid);
})();
