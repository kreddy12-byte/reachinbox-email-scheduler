import { useId, useRef, useState } from 'react';
import { parseLeadCsv, type CsvParseResult } from '../../utils/csv';

interface LeadUploaderProps {
  value: CsvParseResult | null;
  onChange: (result: CsvParseResult | null) => void;
  error?: string | null;
}

export function LeadUploader({ value, onChange, error }: LeadUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    setParseError(null);
    if (!file) {
      onChange(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      onChange(null);
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseLeadCsv(text, file.name);
      if (parsed.emails.length === 0) {
        setParseError('No valid email addresses found in this CSV.');
      }
      onChange(parsed);
    } catch {
      setParseError('Failed to read CSV file.');
      onChange(null);
    }
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
      >
        Leads (CSV)
      </label>

      <div className="rounded-xl border border-dashed border-[var(--ri-border)] bg-slate-50 px-4 py-4">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null);
          }}
        />

        {value ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--ri-ink)]">
                {value.fileName}
              </p>
              <p className="mt-1 text-xs text-[var(--ri-muted)]">
                {value.totalRows} row{value.totalRows === 1 ? '' : 's'} ·{' '}
                {value.emails.length} valid lead
                {value.emails.length === 1 ? '' : 's'}
                {value.invalidCount > 0
                  ? ` · ${value.invalidCount} invalid`
                  : ''}
                {value.duplicateCount > 0
                  ? ` · ${value.duplicateCount} duplicate${value.duplicateCount === 1 ? '' : 's'} removed`
                  : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-[var(--ri-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ri-ink)] hover:bg-slate-50"
              >
                Replace CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setParseError(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm font-medium text-[var(--ri-primary)] hover:underline"
          >
            Upload CSV with lead emails
          </button>
        )}
      </div>

      {(error || parseError) && (
        <p className="mt-1.5 text-xs text-rose-700" role="alert">
          {error || parseError}
        </p>
      )}
    </div>
  );
}
