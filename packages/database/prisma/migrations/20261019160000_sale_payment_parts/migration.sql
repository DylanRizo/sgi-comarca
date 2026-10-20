BEGIN;

-- Preserve the one immutable full receipt and ADR-021's payment reference.
-- No existing receipt, sale, closing or permission is rewritten.
CREATE TABLE sale_payment_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES sale_payments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  method_text VARCHAR(160) NOT NULL CHECK (btrim(method_text) <> ''),
  CONSTRAINT sale_payment_parts_payment_position_key UNIQUE (payment_id, position)
);

CREATE FUNCTION guard_sale_payment_part_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_status sale_status;
  source_payment_status payment_status;
BEGIN
  SELECT s.status, s.payment_status INTO source_status, source_payment_status
  FROM sale_payments p JOIN sales s ON s.id = p.sale_id
  WHERE p.id = NEW.payment_id FOR UPDATE OF s;
  IF source_status IS DISTINCT FROM 'COMPLETED'::sale_status
     OR source_payment_status IS DISTINCT FROM 'PENDING'::payment_status THEN
    RAISE EXCEPTION 'payment parts can only be created while recording the original pending sale payment'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_payment_parts_source_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_sale_payment_parts()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  receipt_id UUID;
  receipt_total NUMERIC(18,2);
  source_payment_status payment_status;
  part_count INTEGER;
  part_total NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'sale_payments' THEN receipt_id := NEW.id;
  ELSE receipt_id := NEW.payment_id; END IF;
  SELECT p.amount, s.payment_status INTO receipt_total, source_payment_status
  FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE p.id = receipt_id;
  SELECT count(*), coalesce(sum(amount), 0) INTO part_count, part_total
  FROM sale_payment_parts WHERE payment_id = receipt_id;
  IF source_payment_status IS DISTINCT FROM 'PAID'::payment_status
     OR (part_count > 0 AND (part_count > 10 OR part_total <> receipt_total)) THEN
    RAISE EXCEPTION 'the complete payment must settle the sale and its parts must exactly equal the receipt total'
      USING ERRCODE = '23514', CONSTRAINT = 'sale_payment_parts_complete';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sale_payment_parts_insert_guard BEFORE INSERT ON sale_payment_parts
FOR EACH ROW EXECUTE FUNCTION guard_sale_payment_part_insert();
CREATE TRIGGER sale_payment_parts_immutable BEFORE UPDATE OR DELETE ON sale_payment_parts
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();
CREATE CONSTRAINT TRIGGER sale_payment_parts_complete AFTER INSERT ON sale_payment_parts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sale_payment_parts();
CREATE CONSTRAINT TRIGGER sale_payments_parts_complete AFTER INSERT ON sale_payments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sale_payment_parts();

COMMIT;
