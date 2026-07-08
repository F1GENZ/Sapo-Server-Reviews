-- Enforce deterministic webhook/domain identity resolution.
-- A normalized domain may have only one active owner; historical owners are preserved as tombstones.
CREATE UNIQUE INDEX IF NOT EXISTS "ShopDomain_domain_active_unique"
  ON "ShopDomain" ("domain")
  WHERE "active" = true;
