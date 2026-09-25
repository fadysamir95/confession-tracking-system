"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  importMembersAction,
  type ImportActionResult,
} from "@/app/actions/import-actions";
import {
  IMPORT_LIMITS,
  buildImportPreview,
  decodeTextFile,
  describeColumns,
  importRowIssueMessage,
  sniffDelimiter,
  parseDelimitedText,
  type ImportPreview,
} from "@/lib/member-import";
import { readXlsx, SpreadsheetReadError } from "@/lib/xlsx-reader";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatNumber, type Locale } from "@/lib/i18n";
import { ShieldIcon, UploadIcon } from "@/components/ui/icons";

/**
 * Rows shown in the preview table before the list is truncated.
 *
 * A roster is short enough to hold in memory but far too long to render. The
 * table is a confirmation aid, not the deliverable, and the counts above it are
 * computed over every row.
 */
const PREVIEW_ROWS = 100;

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "ready"; preview: ImportPreview; columns: { name: string; phone: string } }
  | { kind: "unreadable" }
  | { kind: "tooLarge" }
  | { kind: "unsupported"; detail: string }
  | { kind: "done"; result: ImportActionResult };

function formatBytes(bytes: number, locale: Locale): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${formatNumber(Number(megabytes.toFixed(1)), locale)} MB`;
  return `${formatNumber(Math.round(bytes / 1024), locale)} KB`;
}

function formatColumnLetter(index: number): string {
  // Spreadsheet column letters, so "the first two columns" can be shown as the
  // letters the priest sees in Excel rather than as an abstraction.
  let letter = "";
  let remaining = index;
  do {
    letter = String.fromCharCode(65 + (remaining % 26)) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letter;
}

export function ImportForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.import;
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const readFile = useCallback(async (file: File) => {
    if (file.size > IMPORT_LIMITS.maxFileBytes) {
      setStage({ kind: "tooLarge" });
      return;
    }

    const name = file.name.toLowerCase();

    if (name.endsWith(".xls")) {
      // The legacy binary format is a different container entirely. Saying so
      // is more useful than failing later with "this is not a zip file".
      setStage({ kind: "unsupported", detail: "xls" });
      return;
    }

    setStage({ kind: "reading" });

    try {
      let grid: string[][];

      if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
        grid = await readXlsx(await file.arrayBuffer());
      } else {
        const text = decodeTextFile(new Uint8Array(await file.arrayBuffer()));
        grid = parseDelimitedText(text, sniffDelimiter(text));
      }

      const preview = buildImportPreview(grid);
      if (!preview.rows.length) {
        setStage({ kind: "unreadable" });
        return;
      }

      setStage({
        kind: "ready",
        preview,
        columns: describeColumns(grid, preview.columnsAssumed),
      });
    } catch (error) {
      if (error instanceof SpreadsheetReadError) {
        setStage({ kind: "unreadable" });
        return;
      }
      setStage({ kind: "unreadable" });
    }
  }, []);

  function submit() {
    if (!ready) return;
    const rows = ready.preview.rows
      .filter((row) => row.issue === null)
      .map((row) => ({ name: row.name, phone: row.phone, rowNumber: row.rowNumber }));

    if (!rows.length) return;

    startTransition(async () => {
      const result = await importMembersAction(rows);
      setStage({ kind: "done", result });
    });
  }

  const ready = stage.kind === "ready" ? stage : null;

  return (
    <div className="import">
      <section className="surface-card import-card">
        <h2>{t.choose}</h2>
        <p className="import-card__hint">{t.accepted}</p>

        <div
          className={`import-dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
        >
          <UploadIcon />
          <p>
            {t.dropHere}
            <span>{t.accepted}</span>
          </p>
          <input
            ref={inputRef}
            type="file"
            className="visually-hidden"
            accept=".xlsx,.xlsm,.csv,.txt,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clearing the value lets the same file be chosen twice in a row,
              // which is what someone does after fixing a bad row and re-exporting.
              event.target.value = "";
              if (file) void readFile(file);
            }}
          />
          <button
            className="button button--secondary"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {stage.kind === "idle" ? t.choose : t.change}
          </button>
        </div>

        {stage.kind === "reading" ? (
          <p className="import-status" role="status">
            {t.reading}
          </p>
        ) : null}

        {stage.kind === "tooLarge" ? (
          <div className="form-alert form-alert--error" role="alert">
            {fill(t.fileTooLarge, {
              max: formatBytes(IMPORT_LIMITS.maxFileBytes, locale),
            })}
          </div>
        ) : null}

        {stage.kind === "unreadable" ? (
          <div className="form-alert form-alert--error" role="alert">
            {t.unreadable}
            <span className="import-status__detail">{t.notAccepted}</span>
          </div>
        ) : null}

        {stage.kind === "unsupported" ? (
          <div className="form-alert form-alert--error" role="alert">
            {t.notAccepted}
          </div>
        ) : null}
      </section>

      <div className="import-privacy">
        <ShieldIcon />
        <div>
          <strong>{t.privacyTitle}</strong>
          <p>{t.privacyBody}</p>
        </div>
      </div>

      {ready ? (
        <>
          <section className="surface-card import-card">
            <h2>{t.columns}</h2>
            <dl className="import-columns">
              <dt>{t.nameColumn}</dt>
              <dd>{ready.columns.name || formatColumnLetter(0)}</dd>
              <dt>{t.phoneColumn}</dt>
              <dd>
                {ready.columns.phone
                  ? ready.columns.phone
                  : formatColumnLetter(1)}
              </dd>
            </dl>
            {ready.preview.columnsAssumed ? (
              <p className="form-alert form-alert--warning">{t.assumedColumns}</p>
            ) : null}
            {!ready.columns.phone ? <p className="field-hint">{t.noPhoneColumn}</p> : null}
          </section>

          <section className="surface-card import-card">
            <h2>{t.previewTitle}</h2>
            <div className="import-tally">
              <span>
                {fill(t.rowsFound, {
                  count: formatNumber(ready.preview.rows.length, locale),
                })}
              </span>
              <span className="import-tally__ok">
                {fill(t.willImport, {
                  count: formatNumber(ready.preview.importable.length, locale),
                })}
              </span>
              {ready.preview.skipped.length > 0 ? (
                <span className="import-tally__bad">
                  {fill(t.willSkip, {
                    count: formatNumber(ready.preview.skipped.length, locale),
                  })}
                </span>
              ) : null}
            </div>

            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.columnRow}</th>
                    <th scope="col">{t.columnName}</th>
                    <th scope="col">{t.columnPhone}</th>
                    <th scope="col">{t.columnOutcome}</th>
                  </tr>
                </thead>
                <tbody>
                  {ready.preview.rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.rowNumber} className={row.issue ? "is-skipped" : undefined}>
                      <td className="import-preview__row">{formatNumber(row.rowNumber, locale)}</td>
                      <td>{row.name || "—"}</td>
                      <td dir="ltr">{row.phone ?? "—"}</td>
                      <td>
                        {row.issue ? (
                          <span className="import-preview__issue">
                            {importRowIssueMessage(row.issue, dict)}
                          </span>
                        ) : (
                          <span className="import-preview__ok">{t.outcomeReady}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {ready.preview.rows.length > PREVIEW_ROWS ? (
              <p className="field-hint">
                {fill(t.rowsFound, {
                  count: formatNumber(ready.preview.rows.length, locale),
                })}
              </p>
            ) : null}
          </section>

          <section className="surface-card import-card import-confirm">
            <h2>{t.confirmTitle}</h2>
            <p className="form-section__description">{t.confirmBody}</p>
            <div className="form-actions">
              <button
                className="button button--primary"
                type="button"
                onClick={submit}
                disabled={pending || ready.preview.importable.length === 0}
              >
                {pending
                  ? t.submitting
                  : fill(t.submit, {
                      count: formatNumber(ready.preview.importable.length, locale),
                    })}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {stage.kind === "done" ? <ImportSummary result={stage.result} locale={locale} dict={dict} /> : null}
    </div>
  );
}

function ImportSummary({
  result,
  locale,
  dict,
}: {
  result: ImportActionResult;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.import;

  return (
    <section className="surface-card import-card import-summary" role="status">
      <h2>{t.summaryTitle}</h2>
      <p className="import-summary__headline">{result.message}</p>

      {result.skips.length > 0 ? (
        <>
          <p className="import-summary__count">
            {fill(result.skips.length === 1 ? t.skippedOne : t.skippedMany, {
              count: formatNumber(result.skips.length, locale),
            })}
            {result.duplicates > 0
              ? ` ${fill(t.duplicatesNote, { count: formatNumber(result.duplicates, locale) })}`
              : ""}
          </p>
          <h3>{t.skippedHeading}</h3>
          <ul className="import-skips">
            {result.skips.map((skip) => (
              <li key={`${skip.rowNumber}-${skip.name}`}>
                <span className="import-skips__row">
                  {fill(t.skipRow, { row: formatNumber(skip.rowNumber, locale) })}
                </span>
                <span className="import-skips__name">{skip.name || "—"}</span>
                <span className="import-skips__issue">
                  {importRowIssueMessage(skip.issue, dict)}
                </span>
              </li>
            ))}
          </ul>
          {result.skipsTruncated ? (
            <p className="field-hint">
              {fill(t.skippedMany, { count: formatNumber(result.skips.length, locale) })}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="form-actions">
        <Link className="button button--primary" href="/members">
          {t.goToMembers}
        </Link>
      </div>
    </section>
  );
}
