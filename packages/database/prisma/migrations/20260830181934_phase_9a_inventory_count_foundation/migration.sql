-- CreateEnum
CREATE TYPE "inventory_count_session_status" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "inventory_count_sessions" (
    "id" UUID NOT NULL,
    "status" "inventory_count_session_status" NOT NULL,
    "business_date" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" VARCHAR(500),
    "idempotency_key_hash" CHAR(64),
    "request_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_session_warehouses" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,

    CONSTRAINT "inventory_count_session_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_lines" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "expected_quantity" DECIMAL(18,4) NOT NULL,
    "counted_quantity" DECIMAL(18,4) NOT NULL,
    "difference" DECIMAL(18,4) NOT NULL,
    "adjustment_movement_id" UUID,
    "counted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_count_sessions_status_business_date_idx" ON "inventory_count_sessions"("status", "business_date");

-- CreateIndex
CREATE INDEX "inventory_count_sessions_creator_time_idx" ON "inventory_count_sessions"("created_by_user_id", "business_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_sessions_creator_idempotency_key" ON "inventory_count_sessions"("created_by_user_id", "idempotency_key_hash");

-- CreateIndex
CREATE INDEX "inventory_count_session_warehouses_warehouse_idx" ON "inventory_count_session_warehouses"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_session_warehouses_session_warehouse_key" ON "inventory_count_session_warehouses"("session_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_adjustment_movement_key" ON "inventory_count_lines"("adjustment_movement_id");

-- CreateIndex
CREATE INDEX "inventory_count_lines_session_idx" ON "inventory_count_lines"("session_id");

-- CreateIndex
CREATE INDEX "inventory_count_lines_product_warehouse_idx" ON "inventory_count_lines"("product_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_session_product_warehouse_key" ON "inventory_count_lines"("session_id", "product_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_session_warehouses" ADD CONSTRAINT "inventory_count_session_warehouses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "inventory_count_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_session_warehouses" ADD CONSTRAINT "inventory_count_session_warehouses_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "inventory_count_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_adjustment_movement_id_fkey" FOREIGN KEY ("adjustment_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- FASE 9A — integridad estructural de la auditoria fisica de inventario.
-- La auditoria legacy sustituia cantidades desde una hoja externa y escribia
-- ajustes en lote sin aprobacion previa. Aqui la aprobacion precede a
-- cualquier ajuste, y ningun ajuste se escribe por una ruta propia: la sesion
-- solo enlaza el movimiento producido por la ruta de ajuste de FASE 5C.

ALTER TABLE "inventory_count_sessions"
ADD CONSTRAINT "inventory_count_sessions_reason_not_blank"
CHECK (btrim("reason") <> ''),
ADD CONSTRAINT "inventory_count_sessions_idempotency_hash_pair"
CHECK (("idempotency_key_hash" IS NULL) = ("request_hash" IS NULL)),
ADD CONSTRAINT "inventory_count_sessions_idempotency_hash_format"
CHECK ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "inventory_count_sessions_request_hash_format"
CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "inventory_count_sessions_submitted_shape"
CHECK (
  "status" NOT IN ('PENDING_APPROVAL', 'APPROVED')
  OR "submitted_at" IS NOT NULL
),
ADD CONSTRAINT "inventory_count_sessions_approved_shape"
CHECK (
  ("status" = 'APPROVED')
  = ("approved_by_user_id" IS NOT NULL AND "approved_at" IS NOT NULL)
),
ADD CONSTRAINT "inventory_count_sessions_cancelled_shape"
CHECK (
  ("status" = 'CANCELLED')
  = (
    "cancelled_by_user_id" IS NOT NULL
    AND "cancelled_at" IS NOT NULL
    AND "cancellation_reason" IS NOT NULL
  )
),
ADD CONSTRAINT "inventory_count_sessions_cancellation_reason_not_blank"
CHECK ("cancellation_reason" IS NULL OR btrim("cancellation_reason") <> '');

-- Las cantidades admiten decimales y no pueden ser negativas: un conteo fisico
-- nunca es negativo, y ningun saldo aprobado lo es. La diferencia es siempre
-- contado menos esperado, y la base la verifica en lugar de confiar en el
-- cliente.
ALTER TABLE "inventory_count_lines"
ADD CONSTRAINT "inventory_count_lines_quantities_nonnegative"
CHECK ("expected_quantity" >= 0 AND "counted_quantity" >= 0),
ADD CONSTRAINT "inventory_count_lines_difference_formula"
CHECK ("difference" = "counted_quantity" - "expected_quantity");

-- Una linea solo se captura mientras la sesion sigue abierta y solo sobre un
-- almacen dentro del alcance declarado. Sin el alcance, una linea faltante
-- seria indistinguible de un almacen que nunca se penso contar.
CREATE FUNCTION "guard_inventory_count_line_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_status "inventory_count_session_status";
  warehouse_in_scope boolean;
BEGIN
  SELECT "status" INTO session_status
  FROM "inventory_count_sessions"
  WHERE "id" = NEW."session_id";

  IF session_status <> 'OPEN' THEN
    RAISE EXCEPTION 'inventory count lines can only be captured while the session is open'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_session_open';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "inventory_count_session_warehouses"
    WHERE "session_id" = NEW."session_id"
      AND "warehouse_id" = NEW."warehouse_id"
  ) INTO warehouse_in_scope;

  IF NOT warehouse_in_scope THEN
    RAISE EXCEPTION 'inventory count line warehouse is outside the session scope'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_warehouse_in_scope';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_count_lines_write_guard"
BEFORE INSERT ON "inventory_count_lines"
FOR EACH ROW
EXECUTE FUNCTION "guard_inventory_count_line_write"();

CREATE TRIGGER "inventory_count_lines_immutable_delete"
BEFORE DELETE ON "inventory_count_lines"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

-- Ciclo de vida de la sesion: OPEN -> PENDING_APPROVAL -> APPROVED, o bien
-- CANCELLED desde OPEN o PENDING_APPROVAL. APPROVED y CANCELLED son
-- terminales: una auditoria aprobada es evidencia y no se reescribe.
CREATE FUNCTION "guard_inventory_count_session_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'OPEN' THEN
      RAISE EXCEPTION 'an inventory count session is created open'
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_sessions_initial_status';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."business_date" IS DISTINCT FROM OLD."business_date"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."idempotency_key_hash" IS DISTINCT FROM OLD."idempotency_key_hash"
     OR NEW."request_hash" IS DISTINCT FROM OLD."request_hash" THEN
    RAISE EXCEPTION 'inventory count session identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_sessions_immutable_identity';
  END IF;

  IF OLD."status" IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'a terminal inventory count session cannot change'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_sessions_terminal';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'OPEN' AND NEW."status" IN ('PENDING_APPROVAL', 'CANCELLED'))
      OR (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'invalid inventory count session status transition'
        USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_sessions_status_transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_count_sessions_write_guard"
BEFORE INSERT OR UPDATE ON "inventory_count_sessions"
FOR EACH ROW
EXECUTE FUNCTION "guard_inventory_count_session_write"();

CREATE TRIGGER "inventory_count_sessions_immutable_delete"
BEFORE DELETE ON "inventory_count_sessions"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

-- Una sesion aprobada debe ser coherente al confirmar la transaccion: al menos
-- una linea, y exactamente un ajuste vinculado por cada linea con diferencia
-- distinta de cero. Una linea sin diferencia nunca produce movimiento, porque
-- no hubo cambio de stock que registrar.
CREATE FUNCTION "check_inventory_count_session_approval"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  line_count integer;
  missing_adjustments integer;
  unexpected_adjustments integer;
BEGIN
  IF NEW."status" <> 'APPROVED' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO line_count
  FROM "inventory_count_lines"
  WHERE "session_id" = NEW."id";

  IF line_count = 0 THEN
    RAISE EXCEPTION 'an approved inventory count session requires at least one line'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_sessions_requires_lines';
  END IF;

  SELECT count(*) INTO missing_adjustments
  FROM "inventory_count_lines"
  WHERE "session_id" = NEW."id"
    AND "difference" <> 0
    AND "adjustment_movement_id" IS NULL;

  IF missing_adjustments > 0 THEN
    RAISE EXCEPTION 'every non-zero inventory count line requires its linked adjustment'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_adjustment_required';
  END IF;

  SELECT count(*) INTO unexpected_adjustments
  FROM "inventory_count_lines"
  WHERE "session_id" = NEW."id"
    AND "difference" = 0
    AND "adjustment_movement_id" IS NOT NULL;

  IF unexpected_adjustments > 0 THEN
    RAISE EXCEPTION 'a zero-difference inventory count line cannot carry an adjustment'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_adjustment_forbidden';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "inventory_count_sessions_approval_coherent"
AFTER UPDATE ON "inventory_count_sessions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_inventory_count_session_approval"();

-- El movimiento vinculado debe ser un ajuste real y coincidir con el producto,
-- el almacen y la magnitud de su linea. Vincular una venta o una transferencia
-- como si fuera el ajuste de una auditoria falsearia el ledger.
CREATE FUNCTION "check_inventory_count_line_adjustment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  movement_type "inventory_movement_type";
  movement_product uuid;
  movement_warehouse uuid;
  movement_quantity numeric;
BEGIN
  IF NEW."adjustment_movement_id" IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT "type", "product_id", "warehouse_id", "quantity"
  INTO movement_type, movement_product, movement_warehouse, movement_quantity
  FROM "inventory_movements"
  WHERE "id" = NEW."adjustment_movement_id";

  IF movement_type <> 'ADJUSTMENT' THEN
    RAISE EXCEPTION 'an inventory count line links an ADJUSTMENT movement'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_adjustment_type';
  END IF;

  IF movement_product <> NEW."product_id"
     OR movement_warehouse <> NEW."warehouse_id" THEN
    RAISE EXCEPTION 'the linked adjustment must match the line product and warehouse'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_adjustment_target';
  END IF;

  IF movement_quantity <> NEW."difference" THEN
    RAISE EXCEPTION 'the linked adjustment quantity must equal the counted difference'
      USING ERRCODE = '23514', CONSTRAINT = 'inventory_count_lines_adjustment_quantity';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "inventory_count_lines_adjustment_coherent"
AFTER INSERT OR UPDATE ON "inventory_count_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_inventory_count_line_adjustment"();

-- El alcance declarado de una sesion no se reescribe ni se borra.
CREATE TRIGGER "inventory_count_session_warehouses_immutable"
BEFORE UPDATE OR DELETE ON "inventory_count_session_warehouses"
FOR EACH ROW
EXECUTE FUNCTION "prevent_immutable_row_change"();

