-- Schema for the shop: tables, a view, functions, a trigger and an index.
CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE orders (id bigint PRIMARY KEY, user_id int REFERENCES users(id), total numeric(10, 2));

CREATE VIEW active_users (uid, mail) AS
  SELECT u.id, u.email FROM public.users u JOIN orders o ON o.user_id = u.id;

CREATE MATERIALIZED VIEW order_totals AS
  SELECT user_id, sum(total) AS total FROM orders GROUP BY user_id;

CREATE OR REPLACE FUNCTION add_user(p_email text, p_note text DEFAULT 'none') RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO users(email) VALUES (p_email) RETURNING id INTO n;
  PERFORM log_event('user', n);
  UPDATE stats SET c = c + 1;
  EXECUTE format('DELETE FROM %I', 'tmp');
  RETURN n;
END $$;

CREATE FUNCTION log_event(kind text, ref int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO events(kind, ref) VALUES (kind, ref);
$$;

CREATE FUNCTION order_count(uid int) RETURNS TABLE (n bigint) LANGUAGE sql
BEGIN ATOMIC
  SELECT count(*) FROM orders WHERE user_id = uid;
END;

CREATE PROCEDURE purge(IN days int) LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM orders WHERE true;
  CALL log_event('purge', days);
END $$;

CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.created_at := now(); RETURN NEW; END $$;

CREATE TRIGGER users_touch BEFORE INSERT OR UPDATE OF email ON users
  FOR EACH ROW EXECUTE FUNCTION touch();

CREATE UNIQUE INDEX users_email_idx ON users USING btree (lower(email));
CREATE INDEX ON orders (user_id);
CREATE SEQUENCE invoice_seq START 100 INCREMENT BY 5 OWNED BY orders.id;
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE TYPE address AS (street text, zip varchar(10));
CREATE DOMAIN positive_int AS int CHECK (VALUE > 0);
CREATE POLICY own_orders ON orders FOR SELECT USING (user_id = current_user_id());
COMMENT ON TABLE users IS 'People who can sign in';
COMMENT ON FUNCTION add_user(text, text) IS 'Creates a user';
