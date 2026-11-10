/**
 * Which SQL dialect a file is written in. The language detector already separates PL/pgSQL,
 * T-SQL, PL/SQL and SQL PL by content; plain "SQL" files are told apart here by markers that
 * only one dialect accepts. The result is a reading choice, and the file status names it.
 */
import type { Dialect } from './types';

const BY_LANGUAGE: Record<string, Dialect> = {
  PLpgSQL: 'postgresql',
  TSQL: 'tsql',
  PLSQL: 'oracle',
  SQLPL: 'db2',
};

const MARKERS: [Dialect, RegExp][] = [
  [
    'tsql',
    /^\s*GO\s*$|\bNVARCHAR\s*\(\s*MAX\s*\)|\bSET\s+NOCOUNT\b|\bIDENTITY\s*\(\s*\d|\bsp_executesql\b|^\s*EXEC(UTE)?\s+\[?dbo\]?\./im,
  ],
  [
    'mysql',
    /^\s*DELIMITER\s+\S+\s*$|\bAUTO_INCREMENT\b|\bENGINE\s*=\s*\w+|\bUNSIGNED\b|`\w+`\s+(INT|VARCHAR|BIGINT|TEXT)/im,
  ],
  [
    'oracle',
    /\bVARCHAR2\b|\bNUMBER\s*\(\s*\d|\bPACKAGE\s+BODY\b|^\s*\/\s*$|\bDBMS_\w+\.|\bPRAGMA\s+AUTONOMOUS_TRANSACTION\b|\bSYSDATE\b/im,
  ],
  [
    'db2',
    /\bREFERENCING\s+(NEW|OLD)\s+(ROW\s+)?AS\b|^\s*--#SET\s+TERMINATOR\b|\b(MODIFIES|READS)\s+SQL\s+DATA\b[\s\S]*\bBEGIN\s+ATOMIC\b|\bLANGUAGE\s+SQL\b[\s\S]*\bBEGIN\s+ATOMIC\b(?![\s\S]*\$\$)/im,
  ],
  [
    'postgresql',
    /\$\$|\bLANGUAGE\s+'?(plpgsql|sql)\b|\bSERIAL\b|\bBIGSERIAL\b|\bJSONB\b|\bTIMESTAMPTZ\b|::\w+|\bCREATE\s+EXTENSION\b|\bRETURNS\s+TRIGGER\b/im,
  ],
  [
    'sqlite',
    /\bAUTOINCREMENT\b|^\s*PRAGMA\s+\w+|\bWITHOUT\s+ROWID\b|\bINSERT\s+OR\s+(REPLACE|IGNORE)\b/im,
  ],
];

/** The dialect a file is read as, and the evidence for it. */
/** Syntax only one dialect's client or server accepts; it outweighs the language hint. */
const DECISIVE: [Dialect, RegExp][] = [
  ['tsql', /^\s*GO\s*$/im],
  ['mysql', /^\s*DELIMITER\s+\S+\s*$|\bAUTO_INCREMENT\b|\)\s*ENGINE\s*=\s*\w+/im],
  ['db2', /^\s*--#SET\s+TERMINATOR\b/im],
  ['sqlite', /\bAUTOINCREMENT\b|^\s*PRAGMA\s+\w+/im],
];

export function detectDialect(text: string, language?: string): { dialect: Dialect; why: string } {
  const sample = text.length > 200_000 ? text.slice(0, 200_000) : text;
  for (const [d, re] of DECISIVE) {
    const m = re.exec(sample);
    if (m) return { dialect: d, why: `contains "${m[0].trim().slice(0, 40)}"` };
  }
  const hinted = language ? BY_LANGUAGE[language] : undefined;
  if (hinted) return { dialect: hinted, why: `file detected as ${language}` };
  for (const [d, re] of MARKERS) {
    const m = re.exec(sample);
    if (m) return { dialect: d, why: `contains "${m[0].trim().slice(0, 40)}"` };
  }
  return { dialect: 'generic', why: 'no dialect-specific syntax found' };
}
