--#SET TERMINATOR @
CREATE PROCEDURE bump_stock (IN p_item INT, IN p_qty INT)
  LANGUAGE SQL
  MODIFIES SQL DATA
BEGIN ATOMIC
  UPDATE stock SET qty = qty + p_qty WHERE item = p_item;
  INSERT INTO stock_log (item, qty) VALUES (p_item, p_qty);
END@
CREATE FUNCTION stock_of (p_item INT) RETURNS INT
  LANGUAGE SQL
  READS SQL DATA
  RETURN (SELECT qty FROM stock WHERE item = p_item)@
