PRAGMA foreign_keys = ON;
CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, tag TEXT);
CREATE INDEX IF NOT EXISTS notes_tag ON notes(tag);
CREATE VIEW tagged AS SELECT id, tag FROM notes WHERE tag IS NOT NULL;
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO note_log(note_id) VALUES (new.id);
END;
INSERT OR REPLACE INTO notes(id, body) VALUES (1, 'x');
