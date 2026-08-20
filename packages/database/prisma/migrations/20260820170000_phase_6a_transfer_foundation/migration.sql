-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" UUID NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "idempotency_key_hash" CHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_transfers_distinct_warehouses"
        CHECK ("from_warehouse_id" <> "to_warehouse_id"),
    CONSTRAINT "inventory_transfers_reason_not_blank"
        CHECK (btrim("reason") <> ''),
    CONSTRAINT "inventory_transfers_idempotency_hash_format"
        CHECK ("idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "inventory_transfers_request_hash_format"
        CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

-- CreateTable
CREATE TABLE "inventory_transfer_items" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "inventory_transfer_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_transfer_items_quantity_positive"
        CHECK ("quantity" > 0)
);

-- AlterTable
ALTER TABLE "inventory_movements"
ADD COLUMN "transfer_item_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_actor_idempotency_key"
ON "inventory_transfers"("actor_user_id", "idempotency_key_hash");

-- CreateIndex
CREATE INDEX "inventory_transfers_from_time_idx"
ON "inventory_transfers"("from_warehouse_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transfers_to_time_idx"
ON "inventory_transfers"("to_warehouse_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transfers_actor_time_idx"
ON "inventory_transfers"("actor_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfer_items_transfer_product_key"
ON "inventory_transfer_items"("transfer_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_product_idx"
ON "inventory_transfer_items"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_transfer_item_idx"
ON "inventory_movements"("transfer_item_id");

-- A transfer item has at most one movement for each required ledger side.
CREATE UNIQUE INDEX "inventory_movements_transfer_out_key"
ON "inventory_movements"("transfer_item_id")
WHERE "type" = 'TRANSFER_OUT';

CREATE UNIQUE INDEX "inventory_movements_transfer_in_key"
ON "inventory_movements"("transfer_item_id")
WHERE "type" = 'TRANSFER_IN';

-- AddForeignKey
ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_from_warehouse_id_fkey"
FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_to_warehouse_id_fkey"
FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "inventory_transfer_items"
ADD CONSTRAINT "inventory_transfer_items_transfer_id_fkey"
FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "inventory_transfer_items"
ADD CONSTRAINT "inventory_transfer_items_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_transfer_item_id_fkey"
FOREIGN KEY ("transfer_item_id") REFERENCES "inventory_transfer_items"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A transfer movement must reference an item; every other movement must not.
ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_transfer_item_type"
CHECK (
    ("type" IN ('TRANSFER_OUT', 'TRANSFER_IN') AND "transfer_item_id" IS NOT NULL)
    OR
    ("type" NOT IN ('TRANSFER_OUT', 'TRANSFER_IN') AND "transfer_item_id" IS NULL)
);

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_transfer_out_negative"
CHECK ("type" <> 'TRANSFER_OUT' OR "quantity_delta" < 0);

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_transfer_in_positive"
CHECK ("type" <> 'TRANSFER_IN' OR "quantity_delta" > 0);

-- The historical transfer document and its items are append-only.
CREATE TRIGGER "inventory_transfers_immutable"
BEFORE UPDATE OR DELETE ON "inventory_transfers"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE TRIGGER "inventory_transfer_items_immutable"
BEFORE UPDATE OR DELETE ON "inventory_transfer_items"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

-- Deferred validation observes the final transaction state. It rejects an
-- empty transfer and any item that does not have one exact, coherent OUT/IN
-- pair. The application must still create the complete aggregate atomically.
CREATE FUNCTION "enforce_inventory_transfer_has_items"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "inventory_transfer_items"
    WHERE "transfer_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'inventory transfer requires at least one item'
      USING ERRCODE = '23514',
            CONSTRAINT = 'inventory_transfer_requires_item';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "inventory_transfer_requires_item"
AFTER INSERT ON "inventory_transfers"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_inventory_transfer_has_items"();

CREATE FUNCTION "enforce_inventory_transfer_item_ledger"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  coherent_out_count integer;
  coherent_in_count integer;
  total_out_count integer;
  total_in_count integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE movement."type" = 'TRANSFER_OUT'),
    count(*) FILTER (WHERE movement."type" = 'TRANSFER_IN'),
    count(*) FILTER (
      WHERE movement."type" = 'TRANSFER_OUT'
        AND movement."product_id" = item."product_id"
        AND movement."warehouse_id" = transfer."from_warehouse_id"
        AND movement."quantity_delta" = -item."quantity"
        AND movement."actor_user_id" = transfer."actor_user_id"
    ),
    count(*) FILTER (
      WHERE movement."type" = 'TRANSFER_IN'
        AND movement."product_id" = item."product_id"
        AND movement."warehouse_id" = transfer."to_warehouse_id"
        AND movement."quantity_delta" = item."quantity"
        AND movement."actor_user_id" = transfer."actor_user_id"
    )
  INTO total_out_count, total_in_count, coherent_out_count, coherent_in_count
  FROM "inventory_transfer_items" AS item
  JOIN "inventory_transfers" AS transfer ON transfer."id" = item."transfer_id"
  LEFT JOIN "inventory_movements" AS movement
    ON movement."transfer_item_id" = item."id"
  WHERE item."id" = NEW."id"
  GROUP BY item."id";

  IF total_out_count <> 1 OR total_in_count <> 1 THEN
    RAISE EXCEPTION 'inventory transfer item requires one OUT and one IN movement'
      USING ERRCODE = '23514',
            CONSTRAINT = 'inventory_transfer_item_complete_ledger';
  END IF;

  IF coherent_out_count <> 1 OR coherent_in_count <> 1 THEN
    RAISE EXCEPTION 'inventory transfer movements do not match their item and transfer'
      USING ERRCODE = '23514',
            CONSTRAINT = 'inventory_transfer_item_coherent_ledger';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "inventory_transfer_item_complete_ledger"
AFTER INSERT ON "inventory_transfer_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_inventory_transfer_item_ledger"();
