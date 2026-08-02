const { spawn, spawnSync } = require("child_process");
const { existsSync, writeSync } = require("fs");
const path = require("path");

const clientRoot = path.resolve(__dirname, "..");
const distRoot = path.resolve(clientRoot, "dist");
const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}`;
const smokeOrgid = "smoke-org";
const smokeDevPassword = (() => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}${pick("month")}${pick("year")}`;
})();
const routes = [
  `/?orgid=${smokeOrgid}`,
  `/reviews?orgid=${smokeOrgid}`,
  `/reviews?orgid=${smokeOrgid}&product=1074668505`,
  `/qna?orgid=${smokeOrgid}`,
  `/qna?orgid=${smokeOrgid}&product=1074668505`,
  `/settings?orgid=${smokeOrgid}`,
  `/dev?orgid=${smokeOrgid}`,
  `/guide?orgid=${smokeOrgid}`,
  `/contact?orgid=${smokeOrgid}`,
  `/health?orgid=${smokeOrgid}&dev=hangquoctai&password=${smokeDevPassword}`,
];
const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function seedAuthStorage() {
  window.localStorage.setItem("orgid", "smoke-org");
  window.localStorage.setItem("auth_session_token", "smoke-token");
  window.localStorage.setItem("auth_session_token:smoke-org", "smoke-token");
  window.localStorage.setItem("auth_verified", "1");
  window.localStorage.setItem("auth_verified:smoke-org", "1");
  window.sessionStorage.setItem("orgid", "smoke-org");
  window.sessionStorage.setItem("auth_session_token", "smoke-token");
  window.sessionStorage.setItem("auth_session_token:smoke-org", "smoke-token");
  window.sessionStorage.setItem("auth_verified", "1");
  window.sessionStorage.setItem("auth_verified:smoke-org", "1");
}

function responseFor(url, method) {
  if (method !== "GET" && method !== "POST") return { data: {} };
  const pathname = new URL(url).pathname;
  if (pathname.includes("/shop/info")) {
    return { data: { orgsub: "smoke", plan: "Pro" } };
  }
  if (pathname.includes("/dashboard/overview")) {
    return {
      data: {
        totalReviews: 0,
        averageRating: 0,
        pendingReviews: 0,
        unrepliedReviews: 0,
        qnaTotal: 0,
        qnaUnanswered: 0,
        productStats: [],
        ratingDistribution: {},
      },
    };
  }
  if (pathname.includes("/products")) {
    return { data: { products: [], total: 0, page: 1, pageSize: 20 } };
  }
  if (pathname.includes("/reviews/all")) {
    return {
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        statusCounts: { all: 0, approved: 0, pending: 0, hidden: 0, spam: 0, unreplied: 0 },
      },
    };
  }
  if (pathname.includes("/qna/all")) {
    return {
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        statusCounts: { all: 0, pending: 0, unanswered: 0, answered: 0, hidden: 0 },
      },
    };
  }
  if (pathname.includes("/reviews/config/widget/revisions")) {
    return { data: [] };
  }
  if (pathname.includes("/reviews/config/widget")) {
    return { data: {} };
  }
  if (pathname.includes("/reviews/config/spam")) {
    return { data: {} };
  }
  if (pathname.includes("/storefront/install/status")) {
    return {
      data: {
        themeApiAvailable: false,
        installMode: "manual_or_dry_run",
        checks: {
          configMetafield: true,
          globalAsset: "unknown",
          productWidget: "unknown",
          qnaPanel: "unknown",
          ratingBadge: "unknown",
          productSchema: "unknown",
          customerIdentityAttrs: "unknown",
        },
        message: "Smoke mode",
      },
    };
  }
  if (pathname.includes("/ops/health")) {
    return {
      data: {
        ok: true,
        lastUpdated: Date.now(),
        database: { ok: true },
        redis: { ok: true, value: "PONG" },
        process: { workerAlive: true, role: "smoke" },
        queueTotals: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
        queues: [],
        counts: { products: 0, reviews: 0, questions: 0, purchases: 0 },
        jobs: { failed: [], latest: [] },
        webhooks: { latest: [], totals: [] },
        catalog: {},
        purchases: {},
      },
    };
  }
  return { data: {} };
}

async function verifyBulkDelete(browser, type) {
  const isReview = type === "reviews";
  const bulkPath = isReview ? "/api/reviews/bulk" : "/api/qna/bulk";
  const listPath = isReview ? "/api/reviews/all" : "/api/qna/all";
  const routePath = isReview ? "/reviews" : "/qna";
  const itemPrefix = isReview ? "review" : "question";
  const itemCount = isReview ? 5 : 3;
  let items = Array.from({ length: itemCount }, (_, index) => ({
    id: `${itemPrefix}-${index + 1}`,
    productId: "1074668505",
    productTitle: "Smoke product",
    productHandle: "smoke-product",
    author: "Smoke customer",
    status: isReview ? "approved" : "pending",
    created_at: Date.now() - index,
    ...(isReview
      ? { rating: 5, content: "Smoke review", media: [] }
      : { question: "Smoke question" }),
  }));
  let bulkBody = null;

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await context.addInitScript(seedAuthStorage);
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;

      if (pathname === bulkPath) {
        bulkBody = request.postDataJSON();
        const deletedIds = new Set((bulkBody.items || []).map((item) => `${item.productId}::${item.id}`));
        items = items.filter((item) => !deletedIds.has(`${item.productId}::${item.id}`));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { requested: itemCount, updated: itemCount, missing: 0 } }),
        });
        return;
      }

      if (pathname === listPath) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              items,
              total: items.length,
              page: 1,
              pageSize: 20,
              totalPages: 1,
              statusCounts: isReview
                ? { all: items.length, approved: items.length, pending: 0, hidden: 0, spam: 0, unreplied: items.length }
                : { all: items.length, pending: items.length, answered: 0, unanswered: items.length, hidden: 0 },
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseFor(request.url(), request.method())),
      });
    });

    const page = await context.newPage();
    await page.goto(`${baseUrl}${routePath}?orgid=${smokeOrgid}`, { waitUntil: "networkidle" });
    await page.locator(".f1g-bulk-table__head .ant-checkbox-input").click({ force: true });
    await page.locator(".f1g-bulk-table__actions button.ant-btn-dangerous").click();
    const modalOpened = await page
      .locator(".ant-modal")
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!modalOpened) {
      throw new Error(`${routePath} bulk delete confirmation did not open`);
    }
    await page.locator(".ant-modal .ant-btn-dangerous").click();
    await page.waitForTimeout(250);
    if (bulkBody?.action !== "delete" || bulkBody.items?.length !== itemCount) {
      throw new Error(`${routePath} bulk delete did not submit expected payload`);
    }
    const removedFromUi = await page
      .waitForFunction(() => document.querySelectorAll(".f1g-bulk-table__row").length === 0, null, {
        timeout: 5000,
      })
      .then(() => true)
      .catch(() => false);
    if (!removedFromUi) {
      throw new Error(`${routePath} bulk delete did not remove rows from the current view`);
    }
  } finally {
    await context.close();
  }
}

async function waitForServer(processHandle) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`preview server exited with code ${processHandle.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await sleep(250);
  }
  throw new Error("preview server did not start in time");
}

async function main() {
  if (!existsSync(distRoot)) {
    throw new Error("client/dist is missing. Run npm run build first.");
  }

  const { chromium } = require("playwright");
  const preview =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `npm run preview -- --host 127.0.0.1 --port ${port}`], {
          cwd: clientRoot,
          detached: true,
          stdio: "ignore",
        })
      : spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
          cwd: clientRoot,
          detached: true,
          stdio: "ignore",
        });

  let passed = false;
  try {
    await waitForServer(preview);
    const browser = await chromium.launch();
    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport });
        await context.addInitScript(seedAuthStorage);
        await context.route("**/api/**", async (route) => {
          const request = route.request();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(responseFor(request.url(), request.method())),
          });
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));

        for (const route of routes) {
          await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
          if (pageErrors.length) {
            throw new Error(`${route} ${viewport.width}px page error: ${pageErrors[0]}`);
          }
          const overflow = await page.evaluate(() => {
            const root = document.documentElement;
            return Math.max(root.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1;
          });
          if (overflow) {
            throw new Error(`${route} overflows horizontally at ${viewport.width}px`);
          }
          const currentOrgid = new URL(page.url()).searchParams.get("orgid");
          if (currentOrgid !== smokeOrgid) {
            throw new Error(`${route} lost orgid at ${viewport.width}px: ${page.url()}`);
          }
          const missingOrgidAnchors = await page.evaluate((orgid) =>
            Array.from(document.querySelectorAll("a[href]"))
              .map((anchor) => anchor.getAttribute("href") || "")
              .filter((href) => href.startsWith("/") && !href.startsWith("//"))
              .filter((href) => {
                const url = new URL(href, window.location.origin);
                if (url.pathname.startsWith("/install")) return false;
                return url.searchParams.get("orgid") !== orgid;
              })
              .slice(0, 5),
            smokeOrgid,
          );
          if (missingOrgidAnchors.length) {
            throw new Error(`${route} has internal links without orgid: ${missingOrgidAnchors.join(", ")}`);
          }
        }
        if (viewport.width >= 768) {
          await page.goto(`${baseUrl}/?orgid=${smokeOrgid}`, { waitUntil: "networkidle" });
          await page.locator(".ant-menu-item").nth(1).click();
          await page.waitForURL((url) => url.pathname === "/reviews");
          const menuOrgid = new URL(page.url()).searchParams.get("orgid");
          if (menuOrgid !== smokeOrgid) {
            throw new Error(`sidebar navigation lost orgid at ${viewport.width}px: ${page.url()}`);
          }
        }
        await context.close();
      }
      await verifyBulkDelete(browser, "reviews");
      await verifyBulkDelete(browser, "qna");
    } finally {
      await browser.close();
    }
    passed = true;
  } finally {
    if (passed) {
      writeSync(1, `OK smoke routes ${routes.length} routes x ${viewports.length} viewports + bulk delete\n`);
    }
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(preview.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-preview.pid);
      } catch {
        preview.kill();
      }
    }
  }
}

main().catch((error) => {
  console.error(`FAIL smoke routes: ${error.message}`);
  process.exit(1);
});
