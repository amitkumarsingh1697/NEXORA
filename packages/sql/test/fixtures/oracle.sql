CREATE TABLE emp (
  empno NUMBER(4) PRIMARY KEY,
  ename VARCHAR2(10),
  deptno NUMBER(2)
);

CREATE SEQUENCE emp_seq START WITH 1000 INCREMENT BY 1 NOCACHE;

CREATE OR REPLACE PROCEDURE raise_salary (p_empno IN NUMBER, p_pct IN OUT NUMBER, p_msg OUT VARCHAR2) IS
  v_sal NUMBER;
BEGIN
  SELECT sal INTO v_sal FROM emp WHERE empno = p_empno;
  UPDATE emp SET sal = sal * (1 + p_pct / 100) WHERE empno = p_empno;
  audit_pkg.log_change('emp', p_empno);
  EXECUTE IMMEDIATE 'ANALYZE TABLE emp COMPUTE STATISTICS';
  p_msg := 'ok';
END raise_salary;
/

CREATE OR REPLACE PACKAGE audit_pkg AS
  PROCEDURE log_change(p_table VARCHAR2, p_id NUMBER);
  FUNCTION changes_today RETURN NUMBER;
END audit_pkg;
/

CREATE OR REPLACE PACKAGE BODY audit_pkg AS
  PROCEDURE log_change(p_table VARCHAR2, p_id NUMBER) IS
  BEGIN
    INSERT INTO audit_log (tbl, id, at) VALUES (p_table, p_id, SYSDATE);
  END log_change;

  FUNCTION changes_today RETURN NUMBER IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM audit_log WHERE at > TRUNC(SYSDATE);
    RETURN n;
  END changes_today;
END audit_pkg;
/

CREATE OR REPLACE TRIGGER emp_bi BEFORE INSERT ON emp FOR EACH ROW
BEGIN
  :NEW.empno := emp_seq.NEXTVAL;
END;
/

CREATE OR REPLACE VIEW emp_v AS SELECT empno, ename FROM emp;
CREATE OR REPLACE TYPE point_t AS OBJECT (x NUMBER, y NUMBER);
/
