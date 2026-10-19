BEGIN;

ALTER TABLE sale_cancellations
  ADD COLUMN replacement_sale_id UUID,
  ADD COLUMN reassigned_payment_id UUID,
  ADD CONSTRAINT sale_cancellations_replacement_sale_key UNIQUE (replacement_sale_id),
  ADD CONSTRAINT sale_cancellations_reassigned_payment_key UNIQUE (reassigned_payment_id),
  ADD CONSTRAINT sale_cancellations_correction_pair CHECK (
    (replacement_sale_id IS NULL) = (reassigned_payment_id IS NULL)
    AND (replacement_sale_id IS NULL OR replacement_sale_id <> sale_id)
  ),
  ADD CONSTRAINT sale_cancellations_replacement_sale_fkey FOREIGN KEY (replacement_sale_id)
    REFERENCES sales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT sale_cancellations_reassigned_payment_fkey FOREIGN KEY (reassigned_payment_id)
    REFERENCES sale_payments(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE sales DROP CONSTRAINT sales_operational_persisted_shape;
ALTER TABLE sales ADD CONSTRAINT sales_operational_persisted_shape CHECK (
  origin <> 'OPERATIONAL' OR (
    created_by_user_id IS NOT NULL AND idempotency_key_hash IS NOT NULL
    AND request_hash IS NOT NULL AND status <> 'LEGACY_UNKNOWN' AND payment_status <> 'UNKNOWN'
    AND (
      (status = 'IN_TRANSIT' AND completed_at IS NULL)
      OR (status = 'COMPLETED' AND completed_at IS NOT NULL)
      OR (status = 'CANCELLED' AND (
        (payment_status = 'PENDING' AND completed_at IS NULL)
        OR (payment_status = 'PAID' AND completed_at IS NOT NULL)
      ))
    )
  )
);

-- The historical payment and cancellation rows stay immutable. A correction
-- is a new cancellation document linking the existing payment, not a copy.
CREATE OR REPLACE FUNCTION guard_sale_action_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source sales%ROWTYPE;
  target sales%ROWTYPE;
  payment sale_payments%ROWTYPE;
  replacement_id uuid := (to_jsonb(NEW)->>'replacement_sale_id')::uuid;
BEGIN
  -- Ordered locking also protects direct inserts of the correction document.
  PERFORM id FROM sales
    WHERE id IN (NEW.sale_id, replacement_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source FROM sales WHERE id = NEW.sale_id;
  IF source.origin = 'OPERATIONAL' THEN
    IF NEW.idempotency_key_hash IS NULL OR NEW.request_hash IS NULL THEN
      RAISE EXCEPTION 'operational sale action requires idempotency hashes'
        USING ERRCODE = '23514', CONSTRAINT = 'sale_actions_operational_hashes_required';
    END IF;
    IF TG_TABLE_NAME = 'in_transit_confirmations' THEN
      IF source.status <> 'IN_TRANSIT' OR source.payment_status <> 'PENDING' THEN
        RAISE EXCEPTION 'only an in-transit sale can be confirmed'
          USING ERRCODE = '23514', CONSTRAINT = 'in_transit_confirmation_source_state';
      END IF;
    ELSIF replacement_id IS NULL THEN
      IF source.status <> 'IN_TRANSIT' OR source.payment_status <> 'PENDING' THEN
        RAISE EXCEPTION 'only a pending in-transit sale can be cancelled'
          USING ERRCODE = '23514', CONSTRAINT = 'sale_cancellation_source_state';
      END IF;
    ELSE
      SELECT * INTO target FROM sales WHERE id = replacement_id;
      SELECT * INTO payment FROM sale_payments
        WHERE id = (to_jsonb(NEW)->>'reassigned_payment_id')::uuid;
      IF source.status <> 'COMPLETED' OR source.payment_status <> 'PAID'
        OR target.id IS NULL OR target.origin <> 'OPERATIONAL'
        OR target.status <> 'COMPLETED' OR target.payment_status <> 'PENDING'
        OR source.id = target.id OR source.total <> target.total
        OR source.currency_code <> target.currency_code OR source.business_date <> target.business_date
        OR payment.id IS NULL OR payment.sale_id <> source.id
        OR payment.amount <> target.total OR payment.currency_code <> target.currency_code
        OR EXISTS (SELECT 1 FROM sale_payments WHERE sale_id = target.id)
        OR EXISTS (SELECT 1 FROM sale_cancellations
          WHERE sale_id IN (source.id, target.id) OR replacement_sale_id IN (source.id, target.id)) THEN
        RAISE EXCEPTION 'duplicate correction requires an uncorrected paid source and matching unpaid replacement'
          USING ERRCODE = '23514', CONSTRAINT = 'sale_duplicate_correction_source';
      END IF;
      IF EXISTS (SELECT 1 FROM daily_closings WHERE business_date = source.business_date) THEN
        RAISE EXCEPTION 'a day with a closing cannot be corrected'
          USING ERRCODE = '23514', CONSTRAINT = 'sale_duplicate_correction_day_open';
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'sale_cancellations' AND btrim(to_jsonb(NEW)->>'reason') = '' THEN
      RAISE EXCEPTION 'operational sale cancellation reason cannot be blank'
        USING ERRCODE = '23514', CONSTRAINT = 'sale_cancellation_reason_not_blank';
    END IF;
  ELSIF replacement_id IS NOT NULL THEN
    RAISE EXCEPTION 'legacy sale correction is not supported'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_duplicate_correction_source';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_sale_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  confirmation_time timestamptz;
  cancellation_exists boolean;
  payment_exists boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.origin = 'OPERATIONAL' AND (NEW.status NOT IN ('IN_TRANSIT', 'COMPLETED')
       OR NEW.payment_status <> 'PENDING') THEN
      RAISE EXCEPTION 'operational sale must start IN_TRANSIT or COMPLETED with PENDING payment'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_operational_initial_state';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','payment_status','completed_at','updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','payment_status','completed_at','updated_at']) THEN
    RAISE EXCEPTION 'sale business fields are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'sales_stable_fields_immutable';
  END IF;
  IF OLD.origin = 'LEGACY_IMPORT' THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'legacy sale lifecycle is immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'sales_legacy_lifecycle_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'sale fulfillment transition must preserve payment status'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_fulfillment_preserves_payment';
    END IF;
    IF OLD.status = 'IN_TRANSIT' AND NEW.status = 'COMPLETED' THEN
      SELECT confirmed_at INTO confirmation_time FROM in_transit_confirmations WHERE sale_id = OLD.id;
      IF confirmation_time IS NULL OR NEW.completed_at IS DISTINCT FROM confirmation_time THEN
        RAISE EXCEPTION 'in-transit confirmation must exist and define completed_at'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_confirmation_required';
      END IF;
    ELSIF OLD.status = 'IN_TRANSIT' AND OLD.payment_status = 'PENDING' AND NEW.status = 'CANCELLED' THEN
      SELECT EXISTS (SELECT 1 FROM sale_cancellations WHERE sale_id = OLD.id AND replacement_sale_id IS NULL)
        INTO cancellation_exists;
      IF NOT cancellation_exists OR NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'pending in-transit cancellation document is required'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_cancellation_required';
      END IF;
    ELSIF OLD.status = 'COMPLETED' AND OLD.payment_status = 'PAID' AND NEW.status = 'CANCELLED' THEN
      IF NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NOT EXISTS (
        SELECT 1 FROM sale_cancellations WHERE sale_id = OLD.id AND replacement_sale_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'paid cancellation requires a duplicate correction and preserves completion history'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_duplicate_correction_required';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid sale fulfillment transition'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_fulfillment_transition';
    END IF;
  ELSE
    IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'completed_at only changes with fulfillment confirmation'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_completed_at_transition';
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      SELECT EXISTS (SELECT 1 FROM sale_payments WHERE sale_id = OLD.id)
        OR EXISTS (SELECT 1 FROM sale_cancellations WHERE replacement_sale_id = OLD.id)
        INTO payment_exists;
      IF NOT (OLD.payment_status = 'PENDING' AND NEW.payment_status = 'PAID'
              AND OLD.status = 'COMPLETED' AND payment_exists) THEN
        RAISE EXCEPTION 'invalid sale payment transition'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_payment_transition';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_operational_sale_documents()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_sale_id uuid;
  parent sales%ROWTYPE;
  confirmation_count integer;
  confirmation_time timestamptz;
  cancellation_count integer;
  correction sale_cancellations%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN target_sale_id := NEW.id;
  ELSE target_sale_id := NEW.sale_id; END IF;
  SELECT * INTO parent FROM sales WHERE id = target_sale_id;
  IF parent.origin IS NULL OR parent.origin <> 'OPERATIONAL' THEN RETURN NULL; END IF;
  SELECT count(*), max(confirmed_at) INTO confirmation_count, confirmation_time
    FROM in_transit_confirmations WHERE sale_id = target_sale_id;
  SELECT count(*) INTO cancellation_count FROM sale_cancellations WHERE sale_id = target_sale_id;
  SELECT * INTO correction FROM sale_cancellations WHERE sale_id = target_sale_id AND replacement_sale_id IS NOT NULL;
  IF parent.status = 'IN_TRANSIT' THEN
    IF parent.completed_at IS NOT NULL OR confirmation_count <> 0 OR cancellation_count <> 0 THEN
      RAISE EXCEPTION 'in-transit sale cannot have terminal documents'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_in_transit_document_state';
    END IF;
  ELSIF parent.status = 'COMPLETED' THEN
    IF parent.completed_at IS NULL OR cancellation_count <> 0 OR confirmation_count > 1
       OR (confirmation_count = 1 AND confirmation_time IS DISTINCT FROM parent.completed_at) THEN
      RAISE EXCEPTION 'completed sale document state is inconsistent'
        USING ERRCODE = '23514', CONSTRAINT = 'sales_completed_document_state';
    END IF;
  ELSIF parent.status = 'CANCELLED' THEN
    IF correction.id IS NOT NULL THEN
      IF parent.payment_status <> 'PAID' OR parent.completed_at IS NULL OR cancellation_count <> 1
         OR confirmation_count > 1 OR (confirmation_count = 1 AND confirmation_time IS DISTINCT FROM parent.completed_at) THEN
        RAISE EXCEPTION 'duplicate cancellation document state is inconsistent'
          USING ERRCODE = '23514', CONSTRAINT = 'sales_cancelled_document_state';
      END IF;
    ELSIF parent.payment_status <> 'PENDING' OR parent.completed_at IS NOT NULL
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

CREATE FUNCTION enforce_duplicate_sale_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  correction sale_cancellations%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    SELECT * INTO correction FROM sale_cancellations
      WHERE replacement_sale_id = NEW.id OR (sale_id = NEW.id AND replacement_sale_id IS NOT NULL);
  ELSE
    SELECT * INTO correction FROM sale_cancellations WHERE id = NEW.id AND replacement_sale_id IS NOT NULL;
  END IF;
  IF correction.id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sales source JOIN sales target ON target.id = correction.replacement_sale_id
    JOIN sale_payments payment ON payment.id = correction.reassigned_payment_id
    WHERE source.id = correction.sale_id AND source.status = 'CANCELLED' AND source.payment_status = 'PAID'
      AND target.status = 'COMPLETED' AND target.payment_status = 'PAID'
      AND payment.sale_id = source.id AND payment.amount = target.total
      AND payment.currency_code = target.currency_code AND source.total = target.total
      AND source.currency_code = target.currency_code AND source.business_date = target.business_date
      AND NOT EXISTS (SELECT 1 FROM sale_payments WHERE sale_id = target.id)
  ) THEN
    RAISE EXCEPTION 'duplicate correction must atomically void source and assign the one existing payment'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_duplicate_correction_complete';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER sale_corrections_complete
AFTER INSERT ON sale_cancellations DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_duplicate_sale_correction();
CREATE CONSTRAINT TRIGGER sales_corrections_complete
AFTER INSERT OR UPDATE ON sales DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_duplicate_sale_correction();

-- Normal collection cannot race a correction into creating a second receipt.
CREATE FUNCTION guard_reassigned_sale_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sale_cancellations WHERE replacement_sale_id = NEW.sale_id) THEN
    RAISE EXCEPTION 'sale already receives an existing payment'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_payment_already_reassigned';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_payments_reassignment_guard BEFORE INSERT ON sale_payments
FOR EACH ROW EXECUTE FUNCTION guard_reassigned_sale_payment();

COMMIT;
