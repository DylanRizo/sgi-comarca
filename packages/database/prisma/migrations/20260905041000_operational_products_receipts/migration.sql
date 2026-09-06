CREATE TABLE product_groups (
  id UUID PRIMARY KEY, code VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE products ADD COLUMN group_id UUID REFERENCES product_groups(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE inventory_commands (
  id UUID PRIMARY KEY, actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operation VARCHAR(80) NOT NULL, key_hash CHAR(64) NOT NULL, request_hash CHAR(64) NOT NULL,
  result JSONB NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_user_id, operation, key_hash),
  CHECK (key_hash ~ '^[0-9a-f]{64}$' AND request_hash ~ '^[0-9a-f]{64}$')
);
CREATE TABLE stock_receipts (
  id UUID PRIMARY KEY, actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason VARCHAR(500) NOT NULL CHECK (length(trim(reason)) > 0), occurred_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX stock_receipts_occurred_at_id_idx ON stock_receipts(occurred_at, id);
CREATE TABLE stock_receipt_items (
  id UUID PRIMARY KEY, receipt_id UUID NOT NULL REFERENCES stock_receipts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0), unit_cost NUMERIC(18,2) CHECK (unit_cost >= 0),
  unit_price NUMERIC(18,2) CHECK (unit_price >= 0),
  movement_id UUID NOT NULL UNIQUE REFERENCES inventory_movements(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX stock_receipt_items_receipt_id_idx ON stock_receipt_items(receipt_id);
CREATE TRIGGER inventory_commands_immutable BEFORE UPDATE OR DELETE ON inventory_commands FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();
CREATE TRIGGER stock_receipts_immutable BEFORE UPDATE OR DELETE ON stock_receipts FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();
CREATE TRIGGER stock_receipt_items_immutable BEFORE UPDATE OR DELETE ON stock_receipt_items FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();
CREATE FUNCTION check_stock_receipt_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inventory_movements m JOIN stock_receipts r ON r.id = NEW.receipt_id
    WHERE m.id = NEW.movement_id AND m.type = 'RECEIPT' AND m.product_id = NEW.product_id
      AND m.warehouse_id = NEW.warehouse_id AND m.quantity_delta = NEW.quantity AND m.actor_user_id = r.actor_user_id
      AND m.source_type = 'STOCK_RECEIPT' AND m.source_id = NEW.receipt_id
  ) THEN RAISE EXCEPTION 'receipt item and movement disagree' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_receipt_item_coherent AFTER INSERT ON stock_receipt_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_receipt_item();
CREATE FUNCTION check_stock_receipt_has_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stock_receipt_items WHERE receipt_id = NEW.id) THEN
    RAISE EXCEPTION 'receipt requires items' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_receipt_requires_items AFTER INSERT ON stock_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_receipt_has_items();
