-- CreateTable
CREATE TABLE "review_request_emails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "store_domain" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_code" TEXT,
    "customer_email" TEXT NOT NULL,
    "customer_name" TEXT,
    "product_ids" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "review_request_emails_shop_id_order_id_key" ON "review_request_emails"("shop_id", "order_id");

-- CreateIndex
CREATE INDEX "review_request_emails_status_run_at_idx" ON "review_request_emails"("status", "run_at");

-- CreateIndex
CREATE INDEX "review_request_emails_store_domain_created_at_idx" ON "review_request_emails"("store_domain", "created_at");
