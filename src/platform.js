(() => {
  const isAndroid = new URLSearchParams(location.search).get("android") === "1";
  const userAgent = navigator.userAgent || "";
  const isMobile =
    isAndroid ||
    /Android|iPhone|iPad|iPod|Mobi/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) ||
    (!/Windows NT|Macintosh|X11|CrOS/i.test(userAgent) &&
      navigator.userAgentData?.mobile === true);
  const requests = new Map();
  let sequence = 0;
  const storageKey = "MyBudgeter-save-v1";

  // Current tender currencies from Unicode CLDR 48 (2026-10-11 snapshot).
  // Source: unicode-org/cldr-json tag 48.0.0; license: cldr-LICENSE.txt.
  const regionCurrencies = {
    "AC": "SHP",
    "AD": "EUR",
    "AE": "AED",
    "AF": "AFN",
    "AG": "XCD",
    "AI": "XCD",
    "AL": "ALL",
    "AM": "AMD",
    "AO": "AOA",
    "AR": "ARS",
    "AS": "USD",
    "AT": "EUR",
    "AU": "AUD",
    "AW": "AWG",
    "AX": "EUR",
    "AZ": "AZN",
    "BA": "BAM",
    "BB": "BBD",
    "BD": "BDT",
    "BE": "EUR",
    "BF": "XOF",
    "BG": "EUR",
    "BH": "BHD",
    "BI": "BIF",
    "BJ": "XOF",
    "BL": "EUR",
    "BM": "BMD",
    "BN": "BND",
    "BO": "BOB",
    "BQ": "USD",
    "BR": "BRL",
    "BS": "BSD",
    "BT": "BTN",
    "BV": "NOK",
    "BW": "BWP",
    "BY": "BYN",
    "BZ": "BZD",
    "CA": "CAD",
    "CC": "AUD",
    "CD": "CDF",
    "CF": "XAF",
    "CG": "XAF",
    "CH": "CHF",
    "CI": "XOF",
    "CK": "NZD",
    "CL": "CLP",
    "CM": "XAF",
    "CN": "CNY",
    "CO": "COP",
    "CR": "CRC",
    "CU": "CUP",
    "CV": "CVE",
    "CW": "XCG",
    "CX": "AUD",
    "CY": "EUR",
    "CZ": "CZK",
    "DE": "EUR",
    "DG": "USD",
    "DJ": "DJF",
    "DK": "DKK",
    "DM": "XCD",
    "DO": "DOP",
    "DZ": "DZD",
    "EA": "EUR",
    "EC": "USD",
    "EE": "EUR",
    "EG": "EGP",
    "EH": "MAD",
    "ER": "ERN",
    "ES": "EUR",
    "ET": "ETB",
    "EU": "EUR",
    "FI": "EUR",
    "FJ": "FJD",
    "FK": "FKP",
    "FM": "USD",
    "FO": "DKK",
    "FR": "EUR",
    "GA": "XAF",
    "GB": "GBP",
    "GD": "XCD",
    "GE": "GEL",
    "GF": "EUR",
    "GG": "GBP",
    "GH": "GHS",
    "GI": "GIP",
    "GL": "DKK",
    "GM": "GMD",
    "GN": "GNF",
    "GP": "EUR",
    "GQ": "XAF",
    "GR": "EUR",
    "GS": "GBP",
    "GT": "GTQ",
    "GU": "USD",
    "GW": "XOF",
    "GY": "GYD",
    "HK": "HKD",
    "HM": "AUD",
    "HN": "HNL",
    "HR": "EUR",
    "HT": "HTG",
    "HU": "HUF",
    "IC": "EUR",
    "ID": "IDR",
    "IE": "EUR",
    "IL": "ILS",
    "IM": "GBP",
    "IN": "INR",
    "IO": "USD",
    "IQ": "IQD",
    "IR": "IRR",
    "IS": "ISK",
    "IT": "EUR",
    "JE": "GBP",
    "JM": "JMD",
    "JO": "JOD",
    "JP": "JPY",
    "KE": "KES",
    "KG": "KGS",
    "KH": "KHR",
    "KI": "AUD",
    "KM": "KMF",
    "KN": "XCD",
    "KP": "KPW",
    "KR": "KRW",
    "KW": "KWD",
    "KY": "KYD",
    "KZ": "KZT",
    "LA": "LAK",
    "LB": "LBP",
    "LC": "XCD",
    "LI": "CHF",
    "LK": "LKR",
    "LR": "LRD",
    "LS": "ZAR",
    "LT": "EUR",
    "LU": "EUR",
    "LV": "EUR",
    "LY": "LYD",
    "MA": "MAD",
    "MC": "EUR",
    "MD": "MDL",
    "ME": "EUR",
    "MF": "EUR",
    "MG": "MGA",
    "MH": "USD",
    "MK": "MKD",
    "ML": "XOF",
    "MM": "MMK",
    "MN": "MNT",
    "MO": "MOP",
    "MP": "USD",
    "MQ": "EUR",
    "MR": "MRU",
    "MS": "XCD",
    "MT": "EUR",
    "MU": "MUR",
    "MV": "MVR",
    "MW": "MWK",
    "MX": "MXN",
    "MY": "MYR",
    "MZ": "MZN",
    "NA": "NAD",
    "NC": "XPF",
    "NE": "XOF",
    "NF": "AUD",
    "NG": "NGN",
    "NI": "NIO",
    "NL": "EUR",
    "NO": "NOK",
    "NP": "NPR",
    "NR": "AUD",
    "NU": "NZD",
    "NZ": "NZD",
    "OM": "OMR",
    "PA": "PAB",
    "PE": "PEN",
    "PF": "XPF",
    "PG": "PGK",
    "PH": "PHP",
    "PK": "PKR",
    "PL": "PLN",
    "PM": "EUR",
    "PN": "NZD",
    "PR": "USD",
    "PS": "ILS",
    "PT": "EUR",
    "PW": "USD",
    "PY": "PYG",
    "QA": "QAR",
    "RE": "EUR",
    "RO": "RON",
    "RS": "RSD",
    "RU": "RUB",
    "RW": "RWF",
    "SA": "SAR",
    "SB": "SBD",
    "SC": "SCR",
    "SD": "SDG",
    "SE": "SEK",
    "SG": "SGD",
    "SH": "SHP",
    "SI": "EUR",
    "SJ": "NOK",
    "SK": "EUR",
    "SL": "SLE",
    "SM": "EUR",
    "SN": "XOF",
    "SO": "SOS",
    "SR": "SRD",
    "SS": "SSP",
    "ST": "STN",
    "SV": "USD",
    "SX": "XCG",
    "SY": "SYP",
    "SZ": "SZL",
    "TA": "GBP",
    "TC": "USD",
    "TD": "XAF",
    "TF": "EUR",
    "TG": "XOF",
    "TH": "THB",
    "TJ": "TJS",
    "TK": "NZD",
    "TL": "USD",
    "TM": "TMT",
    "TN": "TND",
    "TO": "TOP",
    "TR": "TRY",
    "TT": "TTD",
    "TV": "AUD",
    "TW": "TWD",
    "TZ": "TZS",
    "UA": "UAH",
    "UG": "UGX",
    "UM": "USD",
    "US": "USD",
    "UY": "UYU",
    "UZ": "UZS",
    "VA": "EUR",
    "VC": "XCD",
    "VE": "VES",
    "VG": "USD",
    "VI": "USD",
    "VN": "VND",
    "VU": "VUV",
    "WF": "XPF",
    "WS": "WST",
    "XK": "EUR",
    "YE": "YER",
    "YT": "EUR",
    "ZA": "ZAR",
    "ZM": "ZMW",
    "ZW": "ZWG",
  };

  function browserCurrency() {
    try {
      const locale = new Intl.Locale(navigator.language || "en-US");
      const region = locale.region || locale.maximize().region;
      return {
        locale: locale.toString(),
        currency: regionCurrencies[region] || "USD",
      };
    } catch {
      // Older browsers or invalid language settings retain the default display.
      return { locale: "en-US", currency: "USD" };
    }
  }

  function request(operation, value, budgetId) {
    return new Promise((resolve, reject) => {
      if (!window.AndroidBudget) {
        reject(new Error("Update Android System WebView and reopen the app."));
        return;
      }
      const id = `${Date.now()}-${++sequence}`;
      requests.set(id, { resolve, reject });
      try {
        window.AndroidBudget.postMessage(
          JSON.stringify({ id, operation, value, budgetId }),
        );
      } catch (error) {
        requests.delete(id);
        reject(error);
      }
    });
  }

  window.budgetPlatform = {
    isAndroid,
    isMobile,
    displayCurrency: () =>
      isAndroid
        ? request("displayCurrency")
        : Promise.resolve(browserCurrency()),
    load: () =>
      isAndroid
        ? request("load")
        : Promise.resolve(localStorage.getItem(storageKey)),
    save: (value) =>
      isAndroid
        ? request("save", value)
        : Promise.resolve(localStorage.setItem(storageKey, value)),
    importFile: (budgetId = "") => {
      if (
        isAndroid &&
        !window.confirm(
          budgetId.startsWith("new-budget:")
            ? "Import Budget\n\nChoose a backup file to create a new budget. Existing budgets stay unchanged."
            : "Import Save File\n\nChoose a backup file to replace the active budget. Other budgets stay unchanged.\n\nExport first if you want to keep a copy.",
        )
      )
        return Promise.resolve(null);
      return request("import", null, budgetId);
    },
    exportFile: (value, budgetId = "") => {
      if (
        isAndroid &&
        !window.confirm(
          "Download Budget\n\nYour budgets autosave on this device.\n\nSave a backup of the selected budget to a file. Your budgets stay unchanged.",
        )
      )
        return Promise.resolve(null);
      return request("export", value, budgetId);
    },
    loadSession: () =>
      isAndroid
        ? request("loadSession")
        : Promise.resolve(localStorage.getItem("MyBudgeter-sessions-v1")),
    saveSession: (value) =>
      isAndroid
        ? request("session", value)
        : Promise.resolve(
            localStorage.setItem("MyBudgeter-sessions-v1", value),
          ),
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
  document.documentElement.classList.toggle("mobile-app", isMobile);
})();
