CREATE TABLE ok_table (id int);
CREATE TABLE bad_table (id int,, name text);
CREATE VIEW ok_view AS SELECT id FROM ok_table;
