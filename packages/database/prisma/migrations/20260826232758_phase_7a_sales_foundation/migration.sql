BEGIN;

CREATE TYPE "sale_origin" AS ENUM ('OPERATIONAL', 'LEGACY_IMPORT');

CREATE SEQUENCE "operational_sale_number_seq"
AS BIGINT
INCREMENT BY 1
MINVALUE 1
MAXVALUE 999999999
START WITH 1
CACHE 1
NO CYCLE;

ALTER TABLE "sales"
ADD COLUMN "origin" "sale_origin" NOT NULL,
ADD COLUMN "created_by_user_id" UUID,
ADD COLUMN "idempotency_key_hash" CHAR(64),
ADD COLUMN "request_hash" CHAR(64),
ALTER COLUMN "sale_number" SET DEFAULT
  ('VTA-'::text || lpad(nextval('operational_sale_number_seq'::regclass)::text, 9, '0'::text));

ALTER SEQUENCE "operational_sale_number_seq" OWNED BY "sales"."sale_number";

ALTER TABLE "sale_cancellations"
ADD COLUMN "idempotency_key_hash" CHAR(64),
ADD COLUMN "request_hash" CHAR(64);

ALTER TABLE "in_transit_confirmations"
ADD COLUMN "idempotency_key_hash" CHAR(64),
ADD COLUMN "request_hash" CHAR(64);

CREATE UNIQUE INDEX "sales_creator_idempotency_key"
ON "sales"("created_by_user_id", "idempotency_key_hash");

CREATE UNIQUE INDEX "sale_cancellations_actor_idempotency_key"
ON "sale_cancellations"("cancelled_by_user_id", "idempotency_key_hash");

CREATE UNIQUE INDEX "in_transit_confirmations_actor_idempotency_key"
ON "in_transit_confirmations"("confirmed_by_user_id", "idempotency_key_hash");

CREATE UNIQUE INDEX "inventory_movements_sale_item_sale_key"
ON "inventory_movements"("sale_item_id")
WHERE "type" = 'SALE';

CREATE UNIQUE INDEX "inventory_movements_sale_item_cancellation_key"
ON "inventory_movements"("sale_item_id")
WHERE "type" = 'SALE_CANCELLATION';

ALTER TABLE "sales"
ADD CONSTRAINT "sales_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "sales"
ADD CONSTRAINT "sales_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "sales_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "sales_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "sales_money_nonnegative"
CHECK ("shipping_amount" >= 0 AND "subtotal" >= 0 AND "total" >= 0),
ADD CONSTRAINT "sales_operational_number_format"
CHECK ("origin" <> 'OPERATIONAL' OR "sale_number" ~ '^VTA-[0-9]{9}$'),
ADD CONSTRAINT "sales_operational_persisted_shape"
CHECK (
  "origin" <> 'OPERATIONAL'
  OR (
    "created_by_user_id" IS NOT NULL
    AND "idempotency_key_hash" IS NOT NULL
    AND "request_hash" IS NOT NULL
    AND "status" <> 'LEGACY_UNKNOWN'
    AND "payment_status" <> 'UNKNOWN'
    AND (
      ("status" = 'IN_TRANSIT' AND "completed_at" IS NULL)
      OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
      OR (
        "status" = 'CANCELLED'
        AND "payment_status" = 'PENDING'
        AND "completed_at" IS NULL
      )
    )
  )
);

ALTER TABLE "sale_items"
ADD CONSTRAINT "sale_items_snapshot_money_nonnegative"
CHECK (
  ("unit_price_snapshot" IS NULL OR "unit_price_snapshot" >= 0)
  AND ("unit_cost_snapshot" IS NULL OR "unit_cost_snapshot" >= 0)
  AND "line_subtotal" >= 0
  AND "shipping_allocation" >= 0
);

ALTER TABLE "sale_cancellations"
ADD CONSTRAINT "sale_cancellations_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "sale_cancellations_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "sale_cancellations_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "in_transit_confirmations"
ADD CONSTRAINT "in_transit_confirmations_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "in_transit_confirmations_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "in_transit_confirmations_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$');

CREATE FUNCTION "guard_sale_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  confirmation_time timestamptz;
  cancellation_exists boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."origin" = 'OPERATIONAL' THEN
      IF NEW."status" NOT IN ('IN_TRANSIT', 'COMPLETED')
         OR NEW."payment_status" <> 'PENDING' THEN
        RAISE EXCEPTION 'operational sale must start IN_TRANSIT or COMPLETED with PENDING payment'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_operational_initial_state';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."origin" IS DISTINCT FROM OLD."origin"
     OR NEW."sale_number" IS DISTINCT FROM OLD."sale_number"
     OR NEW."business_date" IS DISTINCT FROM OLD."business_date"
     OR NEW."departure_at" IS DISTINCT FROM OLD."departure_at"
     OR NEW."seller_user_id" IS DISTINCT FROM OLD."seller_user_id"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."idempotency_key_hash" IS DISTINCT FROM OLD."idempotency_key_hash"
     OR NEW."request_hash" IS DISTINCT FROM OLD."request_hash"
     OR NEW."legacy_seller_text" IS DISTINCT FROM OLD."legacy_seller_text"
     OR NEW."deliverer_text" IS DISTINCT FROM OLD."deliverer_text"
     OR NEW."sales_channel_text" IS DISTINCT FROM OLD."sales_channel_text"
     OR NEW."payment_method_text" IS DISTINCT FROM OLD."payment_method_text"
     OR NEW."delivery_place" IS DISTINCT FROM OLD."delivery_place"
     OR NEW."shipping_amount" IS DISTINCT FROM OLD."shipping_amount"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."total" IS DISTINCT FROM OLD."total"
     OR NEW."currency_code" IS DISTINCT FROM OLD."currency_code"
     OR NEW."observations" IS DISTINCT FROM OLD."observations"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'sale business fields are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'sales_stable_fields_immutable';
  END IF;

  IF OLD."origin" = 'LEGACY_IMPORT' THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."payment_status" IS DISTINCT FROM OLD."payment_status"
       OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at" THEN
      RAISE EXCEPTION 'legacy sale lifecycle is immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'sales_legacy_lifecycle_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NEW."payment_status" IS DISTINCT FROM OLD."payment_status" THEN
      RAISE EXCEPTION 'sale fulfillment transition must preserve payment status'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_fulfillment_preserves_payment';
    END IF;

    IF OLD."status" = 'IN_TRANSIT' AND NEW."status" = 'COMPLETED' THEN
      SELECT confirmation."confirmed_at"
      INTO confirmation_time
      FROM "in_transit_confirmations" AS confirmation
      WHERE confirmation."sale_id" = OLD."id";

      IF confirmation_time IS NULL OR NEW."completed_at" IS DISTINCT FROM confirmation_time THEN
        RAISE EXCEPTION 'in-transit confirmation must exist and define completed_at'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_confirmation_required';
      END IF;
    ELSIF OLD."status" = 'IN_TRANSIT'
          AND OLD."payment_status" = 'PENDING'
          AND NEW."status" = 'CANCELLED' THEN
      SELECT EXISTS (
        SELECT 1 FROM "sale_cancellations" WHERE "sale_id" = OLD."id"
      ) INTO cancellation_exists;

      IF NOT cancellation_exists OR NEW."completed_at" IS NOT NULL THEN
        RAISE EXCEPTION 'pending in-transit cancellation document is required'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_cancellation_required';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid sale fulfillment transition'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_fulfillment_transition';
    END IF;
  ELSE
    IF NEW."completed_at" IS DISTINCT FROM OLD."completed_at" THEN
      RAISE EXCEPTION 'completed_at only changes with fulfillment confirmation'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_completed_at_transition';
    END IF;

    IF NEW."payment_status" IS DISTINCT FROM OLD."payment_status"
       AND NOT (
         OLD."payment_status" = 'PENDING'
         AND NEW."payment_status" = 'PAID'
         AND OLD."status" = 'COMPLETED'
       ) THEN
      RAISE EXCEPTION 'invalid sale payment transition'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_payment_transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sales_write_guard"
BEFORE INSERT OR UPDATE ON "sales"
FOR EACH ROW
EXECUTE FUNCTION "guard_sale_write"();

CREATE TRIGGER "sales_immutable_delete"
BEFORE DELETE ON "sales"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE FUNCTION "guard_sale_item_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sale_origin_value "sale_origin";
BEGIN
  SELECT "origin" INTO sale_origin_value
  FROM "sales"
  WHERE "id" = NEW."sale_id";

  IF sale_origin_value = 'OPERATIONAL'
     AND (NEW."unit_price_snapshot" IS NULL OR NEW."unit_cost_snapshot" IS NULL) THEN
    RAISE EXCEPTION 'operational sale item requires price and cost snapshots'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_items_operational_snapshots_required';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sale_items_operational_guard"
BEFORE INSERT ON "sale_items"
FOR EACH ROW
EXECUTE FUNCTION "guard_sale_item_insert"();

CREATE TRIGGER "sale_items_immutable"
BEFORE UPDATE OR DELETE ON "sale_items"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE FUNCTION "guard_sale_action_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sale_origin_value "sale_origin";
  sale_status_value "sale_status";
  payment_status_value "payment_status";
BEGIN
  SELECT "origin", "status", "payment_status"
  INTO sale_origin_value, sale_status_value, payment_status_value
  FROM "sales"
  WHERE "id" = NEW."sale_id"
  FOR UPDATE;

  IF sale_origin_value = 'OPERATIONAL' THEN
    IF NEW."idempotency_key_hash" IS NULL OR NEW."request_hash" IS NULL THEN
      RAISE EXCEPTION 'operational sale action requires idempotency hashes'
        USING ERRCODE = '23514', CONSTRAINT = 'sale_actions_operational_hashes_required';
    END IF;

    IF TG_TABLE_NAME = 'in_transit_confirmations'
       AND (sale_status_value <> 'IN_TRANSIT' OR payment_status_value <> 'PENDING') THEN
      RAISE EXCEPTION 'only an in-transit sale can be confirmed'
        USING ERRCODE = '23514', CONSTRAINT = 'in_transit_confirmation_source_state';
    END IF;

    IF TG_TABLE_NAME = 'sale_cancellations'
       AND (sale_status_value <> 'IN_TRANSIT' OR payment_status_value <> 'PENDING') THEN
      RAISE EXCEPTION 'only a pending in-transit sale can be cancelled'
        USING ERRCODE = '23514', CONSTRAINT = 'sale_cancellation_source_state';
    END IF;

    IF TG_TABLE_NAME = 'sale_cancellations'
       AND btrim(to_jsonb(NEW) ->> 'reason') = '' THEN
      RAISE EXCEPTION 'operational sale cancellation reason cannot be blank'
        USING ERRCODE = '23514', CONSTRAINT = 'sale_cancellation_reason_not_blank';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sale_cancellations_operational_guard"
BEFORE INSERT ON "sale_cancellations"
FOR EACH ROW
EXECUTE FUNCTION "guard_sale_action_insert"();

CREATE TRIGGER "in_transit_confirmations_operational_guard"
BEFORE INSERT ON "in_transit_confirmations"
FOR EACH ROW
EXECUTE FUNCTION "guard_sale_action_insert"();

CREATE TRIGGER "sale_cancellations_immutable"
BEFORE UPDATE OR DELETE ON "sale_cancellations"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE TRIGGER "in_transit_confirmations_immutable"
BEFORE UPDATE OR DELETE ON "in_transit_confirmations"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE FUNCTION "enforce_operational_sale_has_items"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."origin" = 'OPERATIONAL'
     AND NOT EXISTS (SELECT 1 FROM "sale_items" WHERE "sale_id" = NEW."id") THEN
    RAISE EXCEPTION 'operational sale requires at least one item'
      USING ERRCODE = '23514', CONSTRAINT = 'sales_operational_requires_item';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "sales_operational_requires_item"
AFTER INSERT ON "sales"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_has_items"();

CREATE FUNCTION "check_operational_sale_item_ledger"(target_sale_item_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sale_origin_value "sale_origin";
  has_cancellation boolean;
  sale_count integer;
  coherent_sale_count integer;
  cancellation_count integer;
  coherent_cancellation_count integer;
  other_count integer;
BEGIN
  SELECT sale."origin", sale.cancellation_exists
  INTO sale_origin_value, has_cancellation
  FROM (
    SELECT parent."origin",
           EXISTS (SELECT 1 FROM "sale_cancellations" c WHERE c."sale_id" = parent."id") AS cancellation_exists
    FROM "sale_items" item
    JOIN "sales" parent ON parent."id" = item."sale_id"
    WHERE item."id" = target_sale_item_id
  ) AS sale;

  IF sale_origin_value IS NULL OR sale_origin_value <> 'OPERATIONAL' THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE movement."type" = 'SALE'),
    count(*) FILTER (
      WHERE movement."type" = 'SALE'
        AND movement."product_id" = item."product_id"
        AND movement."warehouse_id" = item."warehouse_id"
        AND movement."quantity_delta" = -item."quantity"
        AND movement."actor_user_id" = parent."created_by_user_id"
    ),
    count(*) FILTER (WHERE movement."type" = 'SALE_CANCELLATION'),
    count(*) FILTER (
      WHERE movement."type" = 'SALE_CANCELLATION'
        AND movement."product_id" = item."product_id"
        AND movement."warehouse_id" = item."warehouse_id"
        AND movement."quantity_delta" = item."quantity"
        AND movement."actor_user_id" = cancellation."cancelled_by_user_id"
    ),
    count(*) FILTER (WHERE movement."type" NOT IN ('SALE', 'SALE_CANCELLATION'))
  INTO sale_count, coherent_sale_count, cancellation_count,
       coherent_cancellation_count, other_count
  FROM "sale_items" item
  JOIN "sales" parent ON parent."id" = item."sale_id"
  LEFT JOIN "sale_cancellations" cancellation ON cancellation."sale_id" = parent."id"
  LEFT JOIN "inventory_movements" movement ON movement."sale_item_id" = item."id"
  WHERE item."id" = target_sale_item_id
  GROUP BY item."id";

  IF sale_count <> 1 OR coherent_sale_count <> 1 OR other_count <> 0 THEN
    RAISE EXCEPTION 'operational sale item requires one coherent SALE movement'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_item_operational_sale_ledger';
  END IF;

  IF (NOT has_cancellation AND cancellation_count <> 0)
     OR (has_cancellation AND (cancellation_count <> 1 OR coherent_cancellation_count <> 1)) THEN
    RAISE EXCEPTION 'operational sale item cancellation ledger is inconsistent'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_item_operational_cancellation_ledger';
  END IF;
END;
$$;

CREATE FUNCTION "enforce_operational_sale_item_ledger"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_item_id uuid;
  sale_item_record record;
BEGIN
  IF TG_TABLE_NAME = 'sale_items' THEN
    PERFORM "check_operational_sale_item_ledger"(NEW."id");
  ELSIF TG_TABLE_NAME = 'inventory_movements' THEN
    IF NEW."sale_item_id" IS NOT NULL THEN
      PERFORM "check_operational_sale_item_ledger"(NEW."sale_item_id");
    END IF;
  ELSE
    FOR sale_item_record IN
      SELECT "id" FROM "sale_items" WHERE "sale_id" = NEW."sale_id"
    LOOP
      PERFORM "check_operational_sale_item_ledger"(sale_item_record."id");
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "sale_items_operational_ledger"
AFTER INSERT ON "sale_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_item_ledger"();

CREATE CONSTRAINT TRIGGER "inventory_movements_operational_sale_ledger"
AFTER INSERT ON "inventory_movements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_item_ledger"();

CREATE CONSTRAINT TRIGGER "sale_cancellations_operational_ledger"
AFTER INSERT ON "sale_cancellations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_item_ledger"();

CREATE FUNCTION "enforce_operational_sale_documents"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_sale_id uuid;
  sale_origin_value "sale_origin";
  sale_status_value "sale_status";
  payment_status_value "payment_status";
  completed_time timestamptz;
  confirmation_count integer;
  confirmation_time timestamptz;
  cancellation_count integer;
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    target_sale_id := NEW."id";
  ELSE
    target_sale_id := NEW."sale_id";
  END IF;

  SELECT "origin", "status", "payment_status", "completed_at"
  INTO sale_origin_value, sale_status_value, payment_status_value, completed_time
  FROM "sales"
  WHERE "id" = target_sale_id;

  IF sale_origin_value IS NULL OR sale_origin_value <> 'OPERATIONAL' THEN
    RETURN NULL;
  END IF;

  SELECT count(*), max("confirmed_at")
  INTO confirmation_count, confirmation_time
  FROM "in_transit_confirmations"
  WHERE "sale_id" = target_sale_id;

  SELECT count(*)
  INTO cancellation_count
  FROM "sale_cancellations"
  WHERE "sale_id" = target_sale_id;

  IF sale_status_value = 'IN_TRANSIT' THEN
    IF completed_time IS NOT NULL OR confirmation_count <> 0 OR cancellation_count <> 0 THEN
      RAISE EXCEPTION 'in-transit sale cannot have terminal documents'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_in_transit_document_state';
    END IF;
  ELSIF sale_status_value = 'COMPLETED' THEN
    IF completed_time IS NULL OR cancellation_count <> 0 OR confirmation_count > 1
       OR (confirmation_count = 1 AND confirmation_time IS DISTINCT FROM completed_time) THEN
      RAISE EXCEPTION 'completed sale document state is inconsistent'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_completed_document_state';
    END IF;
  ELSIF sale_status_value = 'CANCELLED' THEN
    IF payment_status_value <> 'PENDING' OR completed_time IS NOT NULL
       OR confirmation_count <> 0 OR cancellation_count <> 1 THEN
      RAISE EXCEPTION 'cancelled sale document state is inconsistent'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_cancelled_document_state';
    END IF;
  ELSE
    RAISE EXCEPTION 'operational sale has an unsupported lifecycle state'
      USING ERRCODE = '23514', CONSTRAINT = 'sales_operational_document_state';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "sales_operational_documents"
AFTER INSERT OR UPDATE ON "sales"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_documents"();

CREATE CONSTRAINT TRIGGER "sale_cancellations_operational_documents"
AFTER INSERT ON "sale_cancellations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_documents"();

CREATE CONSTRAINT TRIGGER "in_transit_confirmations_operational_documents"
AFTER INSERT ON "in_transit_confirmations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_operational_sale_documents"();

COMMIT;
