import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Radio } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const DUBAI_TIME_ZONE = "Asia/Dubai";
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: DUBAI_TIME_ZONE,
  month: "long",
  year: "numeric",
});
const DUBAI_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: DUBAI_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const DUBAI_FULL_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: DUBAI_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export interface BitcoinCalendarEvent {
  id: string;
  name: string;
  starts_at: string;
  ends_at?: string;
  impact?: string;
  source?: string;
}

interface CalendarSnapshot {
  updated_at?: string;
  timezone?: string;
  events?: BitcoinCalendarEvent[];
  event_calendar_error?: string | null;
}

function partsToRecord(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DUBAI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function dateKey(date: Date) {
  const parts = partsToRecord(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthStartFromDubaiKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  // Noon UTC avoids edge cases around the Dubai UTC+4 offset.
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

function formatMonth(key: string) {
  return MONTH_LABEL.format(monthStartFromDubaiKey(key));
}

function normalizedEvents(snapshot: CalendarSnapshot | null) {
  return (Array.isArray(snapshot?.events) ? snapshot.events : [])
    .filter((event) => event && event.name && event.starts_at)
    .map((event, index) => ({
      ...event,
      id: event.id || `${event.name}-${event.starts_at}-${index}`,
    }))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

function eventDateLabel(event: BitcoinCalendarEvent) {
  const date = new Date(event.starts_at);
  return `${DUBAI_FULL_DATE.format(date)} · ${DUBAI_TIME.format(date)} Dubai`;
}

function makeCalendarCells(month: Date) {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
  // Monday-first: Sunday is moved to the end.
  const leadingEmpty = (firstDay.getUTCDay() + 6) % 7;
  const cells: Array<number | null> = Array.from({ length: leadingEmpty }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function eventKeyForDay(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function useCalendarSnapshot() {
  const [snapshot, setSnapshot] = useState<CalendarSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`${API_BASE}/api/bot/data?key=calendar`);
        if (response.ok && alive) {
          const next = await response.json() as { data?: CalendarSnapshot };
          if (next?.data) setSnapshot(next.data);
        }
      } catch {
        // The card remains navigable while the scanner is offline.
      }
      timer = setTimeout(poll, 30_000);
    }

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return snapshot;
}

export function BitcoinCalendar() {
  const snapshot = useCalendarSnapshot();
  const events = useMemo(() => normalizedEvents(snapshot), [snapshot]);
  const todayKey = dateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return monthKey(Number(partsToRecord(now).year), Number(partsToRecord(now).month) - 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const month = monthStartFromDubaiKey(visibleMonth);
  const cells = makeCalendarCells(month);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, BitcoinCalendarEvent[]>();
    for (const event of events) {
      const key = dateKey(new Date(event.starts_at));
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [events]);

  const visibleEvents = events.filter((event) => {
    const date = new Date(event.starts_at);
    return dateKey(date).startsWith(visibleMonth);
  });
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];
  const selectedDate = selectedDay ? new Date(`${selectedDay}T12:00:00Z`) : null;

  function moveMonth(delta: number) {
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1, 12));
    setVisibleMonth(monthKey(next.getUTCFullYear(), next.getUTCMonth()));
    setSelectedDay(null);
  }

  function goToday() {
    const nowParts = partsToRecord(new Date());
    const key = monthKey(Number(nowParts.year), Number(nowParts.month) - 1);
    setVisibleMonth(key);
    setSelectedDay(todayKey);
  }

  return (
    <section
      aria-label="Bitcoin event calendar"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "22px",
        background: "transparent",
        border: "1px solid rgba(239,68,68,0.28)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 60px -34px rgba(239,68,68,0.55)",
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "12%",
          right: "12%",
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.9), transparent)",
        }}
      />

      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.055)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                display: "grid",
                placeItems: "center",
                borderRadius: "12px",
                color: "#ff5c67",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                boxShadow: "0 0 24px -8px rgba(239,68,68,0.9)",
              }}
            >
              <CalendarDays size={19} />
            </div>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" }}>
                BTC Event Calendar
              </div>
              <div style={{ marginTop: "3px", color: "rgba(255,255,255,0.34)", fontSize: "10px", fontWeight: 600 }}>
                Upcoming market events · Dubai time
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: snapshot ? "#ef4444" : "#f5c542",
                boxShadow: `0 0 10px ${snapshot ? "#ef4444" : "#f5c542"}`,
              }}
            />
            <span style={{ color: "rgba(255,255,255,0.33)", fontSize: "8px", fontWeight: 800, letterSpacing: "0.12em" }}>
              {snapshot ? "LIVE SCANNER" : "WAITING FOR BOT"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "14px" }}>
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
            style={navButtonStyle}
          >
            <ChevronLeft size={16} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 900, letterSpacing: "-0.03em", textAlign: "center" }}>
              {formatMonth(visibleMonth)}
            </h2>
            <button type="button" onClick={goToday} style={todayButtonStyle}>TODAY</button>
          </div>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
            style={navButtonStyle}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "5px" }}>
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
            <div key={day} style={{ padding: "2px 0 7px", color: "rgba(255,255,255,0.24)", fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em", textAlign: "center" }}>
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} style={{ minHeight: "48px" }} />;
            const dayKey = eventKeyForDay(month.getUTCFullYear(), month.getUTCMonth(), day);
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const isSelected = selectedDay === dayKey;
            const isToday = dayKey === todayKey;
            const hasEvent = dayEvents.length > 0;
            return (
              <button
                type="button"
                key={dayKey}
                onClick={() => setSelectedDay(isSelected ? null : dayKey)}
                aria-label={`${dayKey}${hasEvent ? `, ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`}
                style={{
                  minHeight: "48px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  borderRadius: "11px",
                  border: isSelected
                    ? "1px solid rgba(255,92,103,0.95)"
                    : isToday
                    ? "1px solid rgba(255,255,255,0.28)"
                    : "1px solid transparent",
                  color: hasEvent ? "#ff6a72" : "rgba(255,255,255,0.72)",
                  background: isSelected
                    ? "rgba(239,68,68,0.24)"
                    : hasEvent
                    ? "rgba(239,68,68,0.10)"
                    : "transparent",
                  boxShadow: isSelected ? "0 0 18px -6px rgba(239,68,68,0.95)" : "none",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: hasEvent || isToday ? 900 : 600, fontVariantNumeric: "tabular-nums" }}>
                  {day}
                </span>
                {hasEvent && (
                  <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#ff4d5a", boxShadow: "0 0 7px #ef4444" }} />
                    {dayEvents.length > 1 && <span style={{ fontSize: "8px", fontWeight: 900 }}>{dayEvents.length}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: "16px", paddingTop: "13px", borderTop: "1px solid rgba(255,255,255,0.055)" }}>
          {selectedDay && selectedDate ? (
            <>
              <div style={{ marginBottom: "9px", color: "rgba(255,255,255,0.43)", fontSize: "9px", fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase" }}>
                {DUBAI_FULL_DATE.format(selectedDate)}
              </div>
              {selectedEvents.length ? selectedEvents.map((event) => (
                <div
                  key={event.id}
                  style={{
                    padding: "12px 13px",
                    borderRadius: "13px",
                    border: "1px solid rgba(239,68,68,0.32)",
                    background: "rgba(239,68,68,0.08)",
                    marginTop: "7px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ color: "#fff", fontSize: "13px", fontWeight: 850, lineHeight: 1.35 }}>{event.name}</div>
                    <span style={{ color: "#ff6a72", fontSize: "8px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {event.impact ?? "HIGH"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", color: "#ff8890", fontSize: "11px", fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>
                    <Clock3 size={13} />
                    {eventDateLabel(event)}
                  </div>
                  {event.source && (
                    <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.29)", fontSize: "9px" }}>
                      Source: {event.source}
                    </div>
                  )}
                </div>
              )) : (
                <div style={{ color: "rgba(255,255,255,0.32)", fontSize: "11px" }}>No BTC-related event was detected for this date.</div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", color: "rgba(255,255,255,0.31)", fontSize: "10px" }}>
              <span>Select a highlighted date to view event details.</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "rgba(255,92,103,0.8)", fontWeight: 800, whiteSpace: "nowrap" }}>
                <Radio size={12} /> {visibleEvents.length} this month
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const navButtonStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  borderRadius: "9px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "rgba(255,255,255,0.65)",
  cursor: "pointer",
};

const todayButtonStyle: React.CSSProperties = {
  padding: "4px 7px",
  borderRadius: "6px",
  border: "1px solid rgba(239,68,68,0.32)",
  background: "rgba(239,68,68,0.08)",
  color: "#ff6a72",
  fontSize: "8px",
  fontWeight: 900,
  letterSpacing: "0.08em",
  cursor: "pointer",
};