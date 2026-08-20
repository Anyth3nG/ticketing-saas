import { useEffect, useRef, useState } from "react";
import { formatDayMonth, formatHeadingDate, toISODate, WEEKDAY_NAMES } from "../utils/date";

// The page heading, doubling as the board's date filter: it reads as today's
// date until clicked, then opens the upcoming week as a menu.
export default function WorkDatePicker({ days, selectedISO, counts, onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = days.find((d) => toISODate(d) === selectedISO) ?? days[0];

  // A dropdown that stays open after you've clicked elsewhere reads as stuck,
  // so close on any outside click and on Escape. Both listeners are only
  // attached while it's actually open.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="date-picker" ref={containerRef}>
      <button
        type="button"
        className="date-picker-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <h1 className="date-picker-heading">{formatHeadingDate(selected)}</h1>
        <span className={`date-picker-caret${open ? " date-picker-caret-open" : ""}`}>
          &#9662;
        </span>
      </button>

      {open && (
        <ul className="date-picker-menu" role="listbox">
          {days.map((day, index) => {
            const iso = toISODate(day);
            const count = counts[iso] ?? 0;
            return (
              <li key={iso}>
                <button
                  type="button"
                  role="option"
                  aria-selected={iso === selectedISO}
                  className={`date-picker-option${
                    iso === selectedISO ? " date-picker-option-active" : ""
                  }`}
                  onClick={() => {
                    onSelect(iso);
                    setOpen(false);
                  }}
                >
                  <span className="date-picker-option-date">{formatDayMonth(day)}</span>
                  <span className="date-picker-option-day">
                    {WEEKDAY_NAMES[day.getDay()]}
                    {index === 0 && <span className="date-picker-today-tag">Today</span>}
                  </span>
                  <span className="date-picker-option-count">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
