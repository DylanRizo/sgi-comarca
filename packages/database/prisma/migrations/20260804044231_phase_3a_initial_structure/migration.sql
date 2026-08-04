-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "inventory_movement_type" AS ENUM ('INITIAL_BALANCE', 'LEGACY', 'RECEIPT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'SALE_CANCELLATION');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('LEGACY_UNKNOWN', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('UNKNOWN', 'PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "legacy_source_type" AS ENUM ('XLSX', 'GOOGLE_SHEETS', 'APPS_SCRIPT');

-- CreateEnum
CREATE TYPE "import_mode" AS ENUM ('DRY_RUN', 'COMMIT');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PENDING', 'RUNNING', 'COMMITTED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "legacy_record_status" AS ENUM ('STAGED', 'IMPORTED', 'REJECTED', 'REQUIRES_HUMAN_APPROVAL');

-- CreateEnum
CREATE TYPE "reconciliation_severity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "reconciliation_status" AS ENUM ('OPEN', 'REQUIRES_HUMAN_APPROVAL', 'RESOLVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login_identifier" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(96) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(300),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(120) NOT NULL,
    "entity_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "request_id" UUID,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "unit_id" UUID,
    "minimum_stock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "current_unit_price" DECIMAL(18,2),
    "current_unit_cost" DECIMAL(18,2),
    "price_review_required" BOOLEAN NOT NULL DEFAULT false,
    "cost_review_required" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_warehouse_valuations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "unit_price" DECIMAL(18,2),
    "unit_cost" DECIMAL(18,2),
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'NIO',
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "effective_at" TIMESTAMPTZ(6),
    "legacy_record_id" UUID,
    "requires_human_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_warehouse_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "type" "inventory_movement_type" NOT NULL,
    "quantity_delta" DECIMAL(18,4) NOT NULL,
    "balance_before" DECIMAL(18,4) NOT NULL,
    "balance_after" DECIMAL(18,4) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "actor_user_id" UUID,
    "source_type" VARCHAR(80),
    "source_id" UUID,
    "sale_item_id" UUID,
    "observation" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "sale_number" VARCHAR(80) NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "sale_status" NOT NULL,
    "payment_status" "payment_status" NOT NULL DEFAULT 'UNKNOWN',
    "departure_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "seller_user_id" UUID,
    "legacy_seller_text" VARCHAR(200),
    "deliverer_text" VARCHAR(200),
    "sales_channel_text" VARCHAR(160),
    "payment_method_text" VARCHAR(160),
    "delivery_place" TEXT,
    "shipping_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'NIO',
    "observations" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price_snapshot" DECIMAL(18,2),
    "unit_cost_snapshot" DECIMAL(18,2),
    "line_subtotal" DECIMAL(18,2) NOT NULL,
    "shipping_allocation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "legacy_record_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_cancellations" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "cancelled_by_user_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_transit_confirmations" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "confirmed_by_user_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_transit_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_sources" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "legacy_source_type" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "legacy_source_id" UUID NOT NULL,
    "mode" "import_mode" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'PENDING',
    "source_checksum" VARCHAR(128) NOT NULL,
    "mapping_version" VARCHAR(120),
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "summary" JSONB,
    "failure_code" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_records" (
    "id" UUID NOT NULL,
    "legacy_source_id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "source_entity" VARCHAR(120) NOT NULL,
    "legacy_id" VARCHAR(160),
    "legacy_row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "raw_hash" VARCHAR(128) NOT NULL,
    "status" "legacy_record_status" NOT NULL DEFAULT 'STAGED',
    "target_warehouse_id" UUID,
    "target_unit_id" UUID,
    "target_product_id" UUID,
    "target_inventory_balance_id" UUID,
    "target_inventory_movement_id" UUID,
    "target_sale_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_issues" (
    "id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "legacy_record_id" UUID,
    "code" VARCHAR(120) NOT NULL,
    "severity" "reconciliation_severity" NOT NULL,
    "status" "reconciliation_status" NOT NULL DEFAULT 'OPEN',
    "requires_human_approval" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "entity_type" VARCHAR(120),
    "entity_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_user_id" UUID,
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reconciliation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_identifier_key" ON "users"("login_identifier");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_revoked_at_idx" ON "user_roles"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_roles_role_revoked_at_idx" ON "user_roles"("role_id", "revoked_at");

-- CreateIndex
CREATE INDEX "role_permissions_role_revoked_at_idx" ON "role_permissions"("role_id", "revoked_at");

-- CreateIndex
CREATE INDEX "role_permissions_permission_revoked_at_idx" ON "role_permissions"("permission_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_permissions_user_revoked_at_idx" ON "user_permissions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_permissions_permission_revoked_at_idx" ON "user_permissions"("permission_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_credentials_user_id_key" ON "password_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_revoked_at_idx" ON "sessions"("expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_occurred_at_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_active_name_idx" ON "warehouses"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE INDEX "units_active_name_idx" ON "units"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_unit_active_idx" ON "products"("unit_id", "active");

-- CreateIndex
CREATE INDEX "inventory_balances_warehouse_product_idx" ON "inventory_balances"("warehouse_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_product_warehouse_key" ON "inventory_balances"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "product_warehouse_valuations_history_idx" ON "product_warehouse_valuations"("product_id", "warehouse_id", "observed_at" DESC);

-- CreateIndex
CREATE INDEX "product_warehouse_valuations_legacy_record_idx" ON "product_warehouse_valuations"("legacy_record_id");

-- CreateIndex
CREATE INDEX "product_warehouse_valuations_review_idx" ON "product_warehouse_valuations"("requires_human_review");

-- CreateIndex
CREATE INDEX "inventory_movements_product_warehouse_time_idx" ON "inventory_movements"("product_id", "warehouse_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_type_time_idx" ON "inventory_movements"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_sale_item_idx" ON "inventory_movements"("sale_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_actor_idx" ON "inventory_movements"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");

-- CreateIndex
CREATE INDEX "sales_business_date_idx" ON "sales"("business_date");

-- CreateIndex
CREATE INDEX "sales_status_business_date_idx" ON "sales"("status", "business_date");

-- CreateIndex
CREATE INDEX "sales_seller_business_date_idx" ON "sales"("seller_user_id", "business_date");

-- CreateIndex
CREATE INDEX "sale_items_sale_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_warehouse_idx" ON "sale_items"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "sale_items_legacy_record_idx" ON "sale_items"("legacy_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_cancellations_sale_id_key" ON "sale_cancellations"("sale_id");

-- CreateIndex
CREATE INDEX "sale_cancellations_actor_time_idx" ON "sale_cancellations"("cancelled_by_user_id", "cancelled_at");

-- CreateIndex
CREATE UNIQUE INDEX "in_transit_confirmations_sale_id_key" ON "in_transit_confirmations"("sale_id");

-- CreateIndex
CREATE INDEX "in_transit_confirmations_actor_time_idx" ON "in_transit_confirmations"("confirmed_by_user_id", "confirmed_at");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_sources_code_key" ON "legacy_sources"("code");

-- CreateIndex
CREATE INDEX "import_batches_source_status_started_idx" ON "import_batches"("legacy_source_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "import_batches_checksum_idx" ON "import_batches"("source_checksum");

-- CreateIndex
CREATE INDEX "legacy_records_batch_entity_row_idx" ON "legacy_records"("import_batch_id", "source_entity", "legacy_row_number");

-- CreateIndex
CREATE INDEX "legacy_records_source_legacy_id_idx" ON "legacy_records"("legacy_source_id", "legacy_id");

-- CreateIndex
CREATE INDEX "reconciliation_issues_batch_status_severity_idx" ON "reconciliation_issues"("import_batch_id", "status", "severity");

-- CreateIndex
CREATE INDEX "reconciliation_issues_legacy_record_idx" ON "reconciliation_issues"("legacy_record_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_warehouse_valuations" ADD CONSTRAINT "product_warehouse_valuations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_warehouse_valuations" ADD CONSTRAINT "product_warehouse_valuations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_warehouse_valuations" ADD CONSTRAINT "product_warehouse_valuations_legacy_record_id_fkey" FOREIGN KEY ("legacy_record_id") REFERENCES "legacy_records"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_legacy_record_id_fkey" FOREIGN KEY ("legacy_record_id") REFERENCES "legacy_records"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_cancellations" ADD CONSTRAINT "sale_cancellations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_cancellations" ADD CONSTRAINT "sale_cancellations_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "in_transit_confirmations" ADD CONSTRAINT "in_transit_confirmations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "in_transit_confirmations" ADD CONSTRAINT "in_transit_confirmations_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_legacy_source_id_fkey" FOREIGN KEY ("legacy_source_id") REFERENCES "legacy_sources"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_legacy_source_id_fkey" FOREIGN KEY ("legacy_source_id") REFERENCES "legacy_sources"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_target_unit_id_fkey" FOREIGN KEY ("target_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_target_product_id_fkey" FOREIGN KEY ("target_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_target_inventory_balance_id_fkey" FOREIGN KEY ("target_inventory_balance_id") REFERENCES "inventory_balances"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_target_inventory_movement_id_fkey" FOREIGN KEY ("target_inventory_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legacy_records" ADD CONSTRAINT "legacy_records_target_sale_id_fkey" FOREIGN KEY ("target_sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_issues" ADD CONSTRAINT "reconciliation_issues_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_issues" ADD CONSTRAINT "reconciliation_issues_legacy_record_id_fkey" FOREIGN KEY ("legacy_record_id") REFERENCES "legacy_records"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_issues" ADD CONSTRAINT "reconciliation_issues_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Essential structural checks not expressible in Prisma schema.
ALTER TABLE "inventory_balances"
ADD CONSTRAINT "inventory_balances_quantity_nonnegative"
CHECK ("quantity" >= 0);

ALTER TABLE "sale_items"
ADD CONSTRAINT "sale_items_quantity_positive"
CHECK ("quantity" > 0);

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_balance_equation"
CHECK ("balance_before" + "quantity_delta" = "balance_after");

-- Canonical identifiers are stored normalized before uniqueness is evaluated.
ALTER TABLE "users"
ADD CONSTRAINT "users_login_identifier_normalized"
CHECK ("login_identifier" = lower(btrim("login_identifier")));

ALTER TABLE "roles"
ADD CONSTRAINT "roles_code_normalized"
CHECK ("code" = upper(btrim("code")));

ALTER TABLE "permissions"
ADD CONSTRAINT "permissions_code_normalized"
CHECK ("code" = lower(btrim("code")));

ALTER TABLE "warehouses"
ADD CONSTRAINT "warehouses_code_normalized"
CHECK ("code" = upper(btrim("code")));

ALTER TABLE "units"
ADD CONSTRAINT "units_code_normalized"
CHECK ("code" = upper(btrim("code")));

ALTER TABLE "products"
ADD CONSTRAINT "products_code_normalized"
CHECK ("code" = upper(btrim("code")));

ALTER TABLE "sales"
ADD CONSTRAINT "sales_sale_number_normalized"
CHECK ("sale_number" = upper(btrim("sale_number")));

ALTER TABLE "legacy_sources"
ADD CONSTRAINT "legacy_sources_code_normalized"
CHECK ("code" = upper(btrim("code")));

-- A grant may have history, but only one active row for the same pair.
CREATE UNIQUE INDEX "user_roles_active_key"
ON "user_roles" ("user_id", "role_id")
WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX "role_permissions_active_key"
ON "role_permissions" ("role_id", "permission_id")
WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX "user_permissions_active_key"
ON "user_permissions" ("user_id", "permission_id")
WHERE "revoked_at" IS NULL;

-- Inventory movements and audit logs are immutable after insertion.
CREATE FUNCTION "prevent_immutable_row_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable table % does not allow %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "inventory_movements_immutable"
BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE TRIGGER "audit_logs_immutable"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();
