-- CreateEnum
CREATE TYPE "finance_origin" AS ENUM ('OPERATIONAL', 'LEGACY_IMPORT');

-- CreateEnum
CREATE TYPE "financial_entry_type" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "daily_closing_status" AS ENUM ('CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "entry_type" "financial_entry_type" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" UUID NOT NULL,
    "origin" "finance_origin" NOT NULL,
    "entry_type" "financial_entry_type" NOT NULL,
    "business_date" DATE NOT NULL,
    "category_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'NIO',
    "description" VARCHAR(500),
    "responsible_user_id" UUID,
    "created_by_user_id" UUID,
    "idempotency_key_hash" CHAR(64),
    "request_hash" CHAR(64),
    "legacy_category_text" VARCHAR(160),
    "legacy_responsible_text" VARCHAR(200),
    "legacy_record_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_closings" (
    "id" UUID NOT NULL,
    "origin" "finance_origin" NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "daily_closing_status" NOT NULL,
    "real_cash" DECIMAL(18,2) NOT NULL,
    "real_digital" DECIMAL(18,2) NOT NULL,
    "system_sales" DECIMAL(18,2) NOT NULL,
    "difference" DECIMAL(18,2) NOT NULL,
    "tolerance_applied" DECIMAL(18,2) NOT NULL,
    "balanced" BOOLEAN NOT NULL,
    "in_transit_sale_count" INTEGER NOT NULL DEFAULT 0,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'NIO',
    "observations" VARCHAR(500),
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMPTZ(6) NOT NULL,
    "idempotency_key_hash" CHAR(64),
    "request_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_closing_reopenings" (
    "id" UUID NOT NULL,
    "closing_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reopened_by_user_id" UUID NOT NULL,
    "reopened_at" TIMESTAMPTZ(6) NOT NULL,
    "idempotency_key_hash" CHAR(64),
    "request_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_closing_reopenings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_categories_code_key" ON "financial_categories"("code");

-- CreateIndex
CREATE INDEX "financial_categories_type_active_idx" ON "financial_categories"("entry_type", "active");

-- CreateIndex
CREATE INDEX "financial_entries_business_date_idx" ON "financial_entries"("business_date");

-- CreateIndex
CREATE INDEX "financial_entries_type_business_date_idx" ON "financial_entries"("entry_type", "business_date");

-- CreateIndex
CREATE INDEX "financial_entries_category_business_date_idx" ON "financial_entries"("category_id", "business_date");

-- CreateIndex
CREATE INDEX "financial_entries_legacy_record_idx" ON "financial_entries"("legacy_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_creator_idempotency_key" ON "financial_entries"("created_by_user_id", "idempotency_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closings_business_date_key" ON "daily_closings"("business_date");

-- CreateIndex
CREATE INDEX "daily_closings_status_business_date_idx" ON "daily_closings"("status", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closings_actor_idempotency_key" ON "daily_closings"("closed_by_user_id", "idempotency_key_hash");

-- CreateIndex
CREATE INDEX "daily_closing_reopenings_closing_time_idx" ON "daily_closing_reopenings"("closing_id", "reopened_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closing_reopenings_actor_idempotency_key" ON "daily_closing_reopenings"("reopened_by_user_id", "idempotency_key_hash");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_legacy_record_id_fkey" FOREIGN KEY ("legacy_record_id") REFERENCES "legacy_records"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "daily_closing_reopenings" ADD CONSTRAINT "daily_closing_reopenings_closing_id_fkey" FOREIGN KEY ("closing_id") REFERENCES "daily_closings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "daily_closing_reopenings" ADD CONSTRAINT "daily_closing_reopenings_reopened_by_user_id_fkey" FOREIGN KEY ("reopened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- FASE 8A — integridad estructural de finanzas y cierres diarios.
-- Reglas aprobadas en ADR-010 (DEC-019, DEC-022, DEC-023, DEC-024).

-- Un asiento financiero persistido es siempre manual: los ingresos de ventas
-- se derivan al leer y nunca se materializan aqui (DEC-022).

ALTER TABLE "financial_entries"
ADD CONSTRAINT "financial_entries_amount_positive"
CHECK ("amount" > 0),
ADD CONSTRAINT "financial_entries_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "financial_entries_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "financial_entries_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "financial_entries_operational_persisted_shape"
CHECK (
  "origin" <> 'OPERATIONAL'
  OR (
    "created_by_user_id" IS NOT NULL
    AND "responsible_user_id" IS NOT NULL
    AND "category_id" IS NOT NULL
    AND "idempotency_key_hash" IS NOT NULL
    AND "request_hash" IS NOT NULL
  )
);

-- La categoria debe coincidir con el tipo del asiento: un gasto no puede
-- clasificarse con una categoria de ingreso.
CREATE FUNCTION "guard_financial_entry_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_type "financial_entry_type";
  category_active boolean;
BEGIN
  IF NEW."category_id" IS NOT NULL THEN
    SELECT "entry_type", "active"
    INTO category_type, category_active
    FROM "financial_categories"
    WHERE "id" = NEW."category_id";

    IF category_type IS DISTINCT FROM NEW."entry_type" THEN
      RAISE EXCEPTION 'financial entry category must match its entry type'
        USING ERRCODE = '23514', CONSTRAINT = 'financial_entries_category_type_match';
    END IF;

    IF NEW."origin" = 'OPERATIONAL' AND NOT category_active THEN
      RAISE EXCEPTION 'operational financial entry requires an active category'
        USING ERRCODE = '23514', CONSTRAINT = 'financial_entries_category_active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "financial_entries_write_guard"
BEFORE INSERT ON "financial_entries"
FOR EACH ROW
EXECUTE FUNCTION "guard_financial_entry_write"();

-- Historial financiero inmutable: corregir exige un asiento inverso, nunca
-- editar o borrar el original.
CREATE TRIGGER "financial_entries_immutable"
BEFORE UPDATE OR DELETE ON "financial_entries"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

-- Cierres diarios. La formula y la tolerancia son las aprobadas en ADR-010:
-- diferencia = efectivo real + digital real - ventas del sistema, sin gastos
-- (DEC-023); cuadrado cuando abs(diferencia) < tolerancia registrada
-- (DEC-024).

ALTER TABLE "daily_closings"
ADD CONSTRAINT "daily_closings_money_nonnegative"
CHECK (
  "real_cash" >= 0
  AND "real_digital" >= 0
  AND "system_sales" >= 0
  AND "tolerance_applied" >= 0
),
ADD CONSTRAINT "daily_closings_in_transit_count_nonnegative"
CHECK ("in_transit_sale_count" >= 0),
ADD CONSTRAINT "daily_closings_difference_formula"
CHECK ("difference" = "real_cash" + "real_digital" - "system_sales"),
ADD CONSTRAINT "daily_closings_balanced_matches_tolerance"
CHECK ("balanced" = (abs("difference") < "tolerance_applied")),
ADD CONSTRAINT "daily_closings_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "daily_closings_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "daily_closings_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "daily_closings_operational_persisted_shape"
CHECK (
  "origin" <> 'OPERATIONAL'
  OR (
    "closed_by_user_id" IS NOT NULL
    AND "idempotency_key_hash" IS NOT NULL
    AND "request_hash" IS NOT NULL
  )
);

-- Un cierre solo puede pasar de CLOSED a REOPENED, y solo con su documento de
-- reapertura presente. Las cifras del cierre son inmutables: reabrir no las
-- reescribe. Volver a cerrar un cierre reabierto queda deliberadamente fuera
-- de FASE 8A porque DEC-025 sigue abierta en ese punto.
CREATE FUNCTION "guard_daily_closing_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reopening_exists boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'CLOSED' THEN
      RAISE EXCEPTION 'a daily closing is created closed'
        USING ERRCODE = '23514', CONSTRAINT = 'daily_closings_initial_status';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."real_cash" IS DISTINCT FROM OLD."real_cash"
     OR NEW."real_digital" IS DISTINCT FROM OLD."real_digital"
     OR NEW."system_sales" IS DISTINCT FROM OLD."system_sales"
     OR NEW."difference" IS DISTINCT FROM OLD."difference"
     OR NEW."tolerance_applied" IS DISTINCT FROM OLD."tolerance_applied"
     OR NEW."balanced" IS DISTINCT FROM OLD."balanced"
     OR NEW."in_transit_sale_count" IS DISTINCT FROM OLD."in_transit_sale_count"
     OR NEW."business_date" IS DISTINCT FROM OLD."business_date"
     OR NEW."origin" IS DISTINCT FROM OLD."origin"
     OR NEW."closed_by_user_id" IS DISTINCT FROM OLD."closed_by_user_id"
     OR NEW."closed_at" IS DISTINCT FROM OLD."closed_at"
     OR NEW."idempotency_key_hash" IS DISTINCT FROM OLD."idempotency_key_hash"
     OR NEW."request_hash" IS DISTINCT FROM OLD."request_hash" THEN
    RAISE EXCEPTION 'daily closing figures are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'daily_closings_immutable_figures';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" <> 'CLOSED' OR NEW."status" <> 'REOPENED' THEN
      RAISE EXCEPTION 'invalid daily closing status transition'
        USING ERRCODE = '23514', CONSTRAINT = 'daily_closings_status_transition';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM "daily_closing_reopenings" WHERE "closing_id" = OLD."id"
    ) INTO reopening_exists;

    IF NOT reopening_exists THEN
      RAISE EXCEPTION 'reopening a daily closing requires its reopening document'
        USING ERRCODE = '23514', CONSTRAINT = 'daily_closings_reopening_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "daily_closings_write_guard"
BEFORE INSERT OR UPDATE ON "daily_closings"
FOR EACH ROW
EXECUTE FUNCTION "guard_daily_closing_write"();

CREATE TRIGGER "daily_closings_immutable_delete"
BEFORE DELETE ON "daily_closings"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

-- El historial de reaperturas se conserva completo y nunca se edita ni borra.
ALTER TABLE "daily_closing_reopenings"
ADD CONSTRAINT "daily_closing_reopenings_reason_not_blank"
CHECK (btrim("reason") <> ''),
ADD CONSTRAINT "daily_closing_reopenings_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "daily_closing_reopenings_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "daily_closing_reopenings_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$');

CREATE TRIGGER "daily_closing_reopenings_immutable"
BEFORE UPDATE OR DELETE ON "daily_closing_reopenings"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();
