2026-08-06: search_replace parallel edits on the SAME file can duplicate the file tail (orphan JSX after final }). Always verify `tail -5` of a file after multiple same-file edits in one batch.
