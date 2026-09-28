CREATE TABLE "sale_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" UUID NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL,
  "method_text" VARCHAR(160) NOT NULL,
  "recorded_by_user_id" UUID NOT NULL,
  "paid_at" TIMESTAMPTZ(6) NOT NULL,
  "idempotency_key_hash" CHAR(64) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_payments_sale_id_key" UNIQUE ("sale_id"),
  CONSTRAINT "sale_payments_actor_idempotency_key" UNIQUE ("recorded_by_user_id", "idempotency_key_hash"),
  CONSTRAINT "sale_payments_amount_non_negative" CHECK ("amount" >= 0),
  CONSTRAINT "sale_payments_currency_code_format" CHECK ("currency_code" ~ '^[A-Z]{3}$'),
  CONSTRAINT "sale_payments_method_not_blank" CHECK (btrim("method_text") <> ''),
  CONSTRAINT "sale_payments_idempotency_hash_format" CHECK ("idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "sale_payments_request_hash_format" CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "sale_payments_actor_time_idx"
ON "sale_payments" ("recorded_by_user_id", "paid_at" DESC);

ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sale_payments_recorded_by_user_id_fkey"
FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_sale_payment_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sale_origin_value "sale_origin";
  sale_status_value "sale_status";
  payment_status_value "payment_status";
  sale_total NUMERIC(18,2);
  sale_currency_code VARCHAR(3);
BEGIN
  SELECT "origin", "status", "payment_status", "total", "currency_code"
  INTO sale_origin_value, sale_status_value, payment_status_value, sale_total, sale_currency_code
  FROM "sales"
  WHERE "id" = NEW."sale_id"
  FOR UPDATE;

  IF sale_origin_value IS NULL
     OR sale_origin_value <> 'OPERATIONAL'
     OR sale_status_value <> 'COMPLETED'
     OR payment_status_value <> 'PENDING' THEN
    RAISE EXCEPTION 'only a completed pending operational sale can be paid'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_payment_source_state';
  END IF;

  IF NEW."amount" IS DISTINCT FROM sale_total
     OR NEW."currency_code" IS DISTINCT FROM sale_currency_code THEN
    RAISE EXCEPTION 'sale payment must match the immutable sale total and currency'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_payment_matches_sale_total';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sale_payments_operational_guard"
BEFORE INSERT ON "sale_payments"
FOR EACH ROW
EXECUTE FUNCTION "guard_sale_payment_insert"();

CREATE TRIGGER "sale_payments_immutable"
BEFORE UPDATE OR DELETE ON "sale_payments"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

CREATE OR REPLACE FUNCTION "guard_sale_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  confirmation_time timestamptz;
  cancellation_exists boolean;
  payment_exists boolean;
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

    IF NEW."payment_status" IS DISTINCT FROM OLD."payment_status" THEN
      SELECT EXISTS (
        SELECT 1 FROM "sale_payments" WHERE "sale_id" = OLD."id"
      ) INTO payment_exists;

      IF NOT (
        OLD."payment_status" = 'PENDING'
        AND NEW."payment_status" = 'PAID'
        AND OLD."status" = 'COMPLETED'
        AND payment_exists
      ) THEN
        RAISE EXCEPTION 'invalid sale payment transition'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_payment_transition';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
