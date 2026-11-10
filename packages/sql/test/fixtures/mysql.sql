CREATE TABLE `customers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW `big_customers` AS SELECT c.id, c.name AS customer FROM customers c WHERE c.id > 100;

DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `add_customer`(IN p_name VARCHAR(100), OUT p_id INT)
BEGIN
  INSERT INTO customers(name) VALUES (p_name);
  SET p_id = LAST_INSERT_ID();
  CALL audit_log('customer', p_id);
  IF p_id > 0 THEN
    UPDATE counters SET n = n + 1 WHERE k = 'customers';
  END IF;
END$$

CREATE FUNCTION customer_count() RETURNS INT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE n INT;
  SELECT COUNT(*) INTO n FROM customers;
  RETURN n;
END$$

CREATE TRIGGER customers_bi BEFORE INSERT ON customers FOR EACH ROW
BEGIN
  SET NEW.name = TRIM(NEW.name);
  INSERT INTO audit(t) VALUES ('customers');
END$$
DELIMITER ;

CREATE INDEX idx_name ON customers (name(20));
CREATE EVENT purge_audit ON SCHEDULE EVERY 1 DAY DO DELETE FROM audit WHERE t < NOW();
