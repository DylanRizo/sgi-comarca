ALTER TABLE inventory_count_lines ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE inventory_count_line_revisions (
  id UUID PRIMARY KEY,
  line_id UUID NOT NULL REFERENCES inventory_count_lines(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 1),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason VARCHAR(500) NOT NULL CHECK (length(trim(reason)) > 0),
  previous_counted_quantity NUMERIC(18,4) NOT NULL CHECK (previous_counted_quantity >= 0),
  new_counted_quantity NUMERIC(18,4) NOT NULL CHECK (new_counted_quantity >= 0),
  corrected_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(line_id, version)
);
CREATE INDEX inventory_count_line_revisions_actor_time_idx ON inventory_count_line_revisions(actor_user_id, corrected_at DESC);
CREATE TRIGGER inventory_count_line_revisions_immutable BEFORE UPDATE OR DELETE ON inventory_count_line_revisions FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_change();

CREATE FUNCTION guard_inventory_count_line_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_status inventory_count_session_status;
BEGIN
  SELECT status INTO session_status FROM inventory_count_sessions WHERE id = OLD.session_id;
  IF session_status = 'OPEN' THEN
    IF NEW.id <> OLD.id OR NEW.session_id <> OLD.session_id OR NEW.product_id <> OLD.product_id
       OR NEW.warehouse_id <> OLD.warehouse_id OR NEW.expected_quantity <> OLD.expected_quantity
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'invalid open count line correction' USING ERRCODE = '23514';
    END IF;
    IF NEW.adjustment_movement_id IS DISTINCT FROM OLD.adjustment_movement_id THEN
      IF OLD.adjustment_movement_id IS NOT NULL OR NEW.adjustment_movement_id IS NULL
         OR NEW.counted_quantity <> OLD.counted_quantity OR NEW.difference <> OLD.difference
         OR NEW.counted_at <> OLD.counted_at OR NEW.version <> OLD.version THEN
        RAISE EXCEPTION 'invalid open count line adjustment link' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.counted_quantity = OLD.counted_quantity OR NEW.version <> OLD.version + 1
       OR NEW.difference <> NEW.counted_quantity - NEW.expected_quantity THEN
      RAISE EXCEPTION 'invalid open count line correction' USING ERRCODE = '23514';
    END IF;
  ELSIF session_status = 'PENDING_APPROVAL' THEN
    IF OLD.adjustment_movement_id IS NOT NULL OR NEW.adjustment_movement_id IS NULL
       OR NEW.session_id <> OLD.session_id OR NEW.product_id <> OLD.product_id OR NEW.warehouse_id <> OLD.warehouse_id
       OR NEW.expected_quantity <> OLD.expected_quantity OR NEW.counted_quantity <> OLD.counted_quantity
       OR NEW.difference <> OLD.difference OR NEW.counted_at <> OLD.counted_at OR NEW.version <> OLD.version THEN
      RAISE EXCEPTION 'submitted count lines are locked' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'closed count lines are locked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_count_lines_update_guard BEFORE UPDATE ON inventory_count_lines FOR EACH ROW EXECUTE FUNCTION guard_inventory_count_line_update();

CREATE FUNCTION check_inventory_count_line_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inventory_count_line_revisions r
    WHERE r.line_id = NEW.id AND r.version = NEW.version
      AND r.previous_counted_quantity = OLD.counted_quantity
      AND r.new_counted_quantity = NEW.counted_quantity
  ) THEN
    RAISE EXCEPTION 'count line correction requires matching revision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_count_line_revision_required AFTER UPDATE OF counted_quantity ON inventory_count_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_inventory_count_line_revision();
