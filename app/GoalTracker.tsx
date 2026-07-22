"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type GoalColor = "violet" | "blue" | "coral" | "green";

type GoalNode = {
  id: string;
  title: string;
  completed: boolean;
  children: GoalNode[];
};

type Goal = GoalNode & {
  note: string;
  targetDate: string;
  color: GoalColor;
  createdAt: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  notes: string;
  createdAt: string;
};

type CalendarItem = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  notes: string;
  kind: "goal" | "event";
  color: GoalColor;
};

type View = "home" | "goals" | "calendar" | "completed";

const STORAGE_KEY = "waypoint-goals-v1";
const CALENDAR_STORAGE_KEY = "waypoint-calendar-v1";
const COLORS: GoalColor[] = ["violet", "blue", "coral", "green"];

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const makeNode = (title: string): GoalNode => ({
  id: makeId(),
  title,
  completed: false,
  children: [],
});

function updateNode(nodes: GoalNode[], id: string, update: (node: GoalNode) => GoalNode): GoalNode[] {
  return nodes.map((node) => {
    if (node.id === id) return update(node);
    return { ...node, children: updateNode(node.children, id, update) };
  });
}

function removeNode(nodes: GoalNode[], id: string): GoalNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeNode(node.children, id) }));
}

function setBranchComplete(node: GoalNode, completed: boolean): GoalNode {
  return {
    ...node,
    completed,
    children: node.children.map((child) => setBranchComplete(child, completed)),
  };
}

function leafCounts(node: GoalNode): { done: number; total: number } {
  if (!node.children.length) return { done: node.completed ? 1 : 0, total: 1 };
  return node.children.reduce(
    (sum, child) => {
      const count = leafCounts(child);
      return { done: sum.done + count.done, total: sum.total + count.total };
    },
    { done: 0, total: 0 },
  );
}

function progressOf(goal: GoalNode) {
  const count = leafCounts(goal);
  return count.total ? Math.round((count.done / count.total) * 100) : 0;
}

function formatDate(value: string) {
  if (!value) return "No target date";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function daysUntil(value: string) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function nextOpenLeaf(node: GoalNode): GoalNode | null {
  if (!node.children.length) return node.completed ? null : node;
  for (const child of node.children) {
    const found = nextOpenLeaf(child);
    if (found) return found;
  }
  return null;
}

const padNumber = (value: number) => String(value).padStart(2, "0");

function dateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function nextDateKey(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return dateKey(date);
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function calendarItemLines(item: CalendarItem) {
  const compactDate = item.date.replaceAll("-", "");
  let dateLines: string[];
  if (item.startTime) {
    const start = new Date(`${item.date}T${item.startTime}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const localStamp = (value: Date) => `${dateKey(value).replaceAll("-", "")}T${padNumber(value.getHours())}${padNumber(value.getMinutes())}00`;
    dateLines = [`DTSTART:${localStamp(start)}`, `DTEND:${localStamp(end)}`];
  } else {
    dateLines = [`DTSTART;VALUE=DATE:${compactDate}`, `DTEND;VALUE=DATE:${nextDateKey(item.date).replaceAll("-", "")}`];
  }
  const description = item.notes || (item.kind === "goal" ? "Goal deadline from Waypoint" : "Waypoint calendar event");
  return [
    "BEGIN:VEVENT",
    `UID:${item.id}@waypoint.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    ...dateLines,
    `SUMMARY:${escapeIcs(item.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
  ];
}

function downloadCalendar(items: CalendarItem[], filename: string) {
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Waypoint//Personal Goal Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...items.flatMap(calendarItemLines),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function GoalForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Goal;
  onSave: (value: Pick<Goal, "title" | "note" | "targetDate" | "color">) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [color, setColor] = useState<GoalColor>(initial?.color ?? "violet");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), note: note.trim(), targetDate, color });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="goal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" aria-hidden="true" />
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{initial ? "Update the destination" : "Choose a destination"}</p>
            <h2 id="goal-form-title">{initial ? "Edit goal" : "Create a new goal"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <form onSubmit={submit}>
          <label>
            Goal name
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What do you want to achieve?"
              maxLength={100}
            />
          </label>
          <label>
            Why it matters <span className="optional">Optional</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="A short reminder for future you"
              maxLength={280}
              rows={3}
            />
          </label>
          <label>
            Target date <span className="optional">Optional</span>
            <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>
          <fieldset>
            <legend>Color</legend>
            <div className="color-options">
              {COLORS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`color-choice ${option} ${color === option ? "selected" : ""}`}
                  aria-label={`Use ${option}`}
                  aria-pressed={color === option}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
          </fieldset>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary">{initial ? "Save changes" : "Create goal"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EventForm({
  initialDate,
  onSave,
  onClose,
}: {
  initialDate: string;
  onSave: (value: Pick<CalendarEvent, "title" | "date" | "startTime" | "notes">) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate || dateKey(new Date()));
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date) return;
    onSave({ title: title.trim(), date, startTime, notes: notes.trim() });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="goal-modal event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" aria-hidden="true" />
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Make time for it</p>
            <h2 id="event-form-title">Add calendar event</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>
        <form onSubmit={submit}>
          <label>
            Event name
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What is happening?"
              maxLength={100}
            />
          </label>
          <div className="event-form-row">
            <label>
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label>
              Time <span className="optional">Optional</span>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
          </div>
          <label>
            Notes <span className="optional">Optional</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything you want to remember"
              maxLength={280}
              rows={3}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary">Add event</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CalendarView({
  goals,
  events,
  onAdd,
  onDelete,
  onSelectGoal,
  onNotice,
  onBackup,
  onRestore,
  hasData,
}: {
  goals: Goal[];
  events: CalendarEvent[];
  onAdd: (date?: string) => void;
  onDelete: (id: string) => void;
  onSelectGoal: (id: string) => void;
  onNotice: (message: string) => void;
  onBackup: () => void;
  onRestore: () => void;
  hasData: boolean;
}) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const items = useMemo<CalendarItem[]>(
    () => [
      ...goals
        .filter((goal) => goal.targetDate)
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          date: goal.targetDate,
          startTime: "",
          notes: goal.note,
          kind: "goal" as const,
          color: goal.color,
        })),
      ...events.map((event) => ({ ...event, kind: "event" as const, color: "violet" as const })),
    ],
    [events, goals],
  );

  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
    for (const dayItems of grouped.values()) {
      dayItems.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
    }
    return grouped;
  }, [items]);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - firstWeekday + 1));
  const todayKey = dateKey(new Date());
  const upcoming = items
    .filter((item) => item.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 8);
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(monthCursor);

  function moveMonth(offset: number) {
    setMonthCursor(new Date(year, month + offset, 1));
  }

  function exportItems(exportItems: CalendarItem[], filename: string) {
    if (!exportItems.length) {
      onNotice("Add a deadline or event before exporting");
      return;
    }
    downloadCalendar(exportItems, filename);
    onNotice(exportItems.length === 1 ? "Calendar event downloaded" : "Calendar file downloaded");
  }

  return (
    <section className="calendar-layout" aria-label="Waypoint calendar">
      <article className="calendar-card">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">Month view</p>
            <h2>{monthLabel}</h2>
          </div>
          <div className="month-controls" aria-label="Change month">
            <button onClick={() => moveMonth(-1)} aria-label="Previous month">&larr;</button>
            <button className="today-button" onClick={() => {
              const now = new Date();
              setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}>Today</button>
            <button onClick={() => moveMonth(1)} aria-label="Next month">&rarr;</button>
          </div>
        </div>

        <div className="calendar-grid calendar-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid calendar-days">
          {cells.map((date) => {
            const key = dateKey(date);
            const dayItems = itemsByDate.get(key) ?? [];
            const inMonth = date.getMonth() === month;
            return (
              <div key={key} className={`calendar-day ${inMonth ? "" : "outside"} ${key === todayKey ? "today" : ""}`}>
                <button className="calendar-day-number" onClick={() => onAdd(key)} aria-label={`Add event on ${date.toLocaleDateString()}`}>
                  {date.getDate()}
                </button>
                <div className="calendar-day-items">
                  {dayItems.slice(0, 2).map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      className={`calendar-chip ${item.kind} ${item.color}`}
                      onClick={() => item.kind === "goal" ? onSelectGoal(item.id) : exportItems([item], `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "waypoint-event"}.ics`)}
                      title={item.kind === "goal" ? `Open goal: ${item.title}` : `Download ${item.title}`}
                    >
                      {item.startTime && <span>{item.startTime}</span>}{item.title}
                    </button>
                  ))}
                  {dayItems.length > 2 && <span className="more-events">+{dayItems.length - 2} more</span>}
                </div>
              </div>
            );
          })}
        </div>
        <button className="calendar-add-hint" onClick={() => onAdd()}>+ Add an event</button>
      </article>

      <aside className="calendar-side">
        <section className="sync-card">
          <div className="sync-icon" aria-hidden="true">&#8644;</div>
          <p className="eyebrow">Use your usual calendar</p>
          <h2>Take Waypoint with you</h2>
          <p>Download one calendar file containing your goal deadlines and events, then import it into Google Calendar, Apple Calendar, or Outlook.</p>
          <div className="calendar-providers" aria-label="Compatible calendars">
            <span>Google</span><span>Apple</span><span>Outlook</span>
          </div>
          <button className="button primary sync-export" onClick={() => exportItems(items, `waypoint-calendar-${dateKey(new Date())}.ics`)}>
            Export calendar (.ics)
          </button>
          <a className="button secondary google-link" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer">
            Open Google Calendar <span aria-hidden="true">&nearr;</span>
          </a>
          <p className="sync-note">Importing creates a copy. Automatic two-way syncing would require connecting a calendar account.</p>
          <div className="calendar-backup-actions">
            <button onClick={onBackup} disabled={!hasData}>Backup Waypoint data</button>
            <button onClick={onRestore}>Restore a backup</button>
          </div>
        </section>

        <section className="upcoming-card">
          <div className="upcoming-heading">
            <div><p className="eyebrow">Coming up</p><h2>Next dates</h2></div>
            <button onClick={() => onAdd()}>+ Event</button>
          </div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.map((item) => (
                <article className="upcoming-item" key={`${item.kind}-${item.id}`}>
                  <div className={`upcoming-date ${item.color}`}>
                    <strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong>
                    <span>{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${item.date}T12:00:00`))}</span>
                  </div>
                  <button className="upcoming-main" onClick={() => item.kind === "goal" ? onSelectGoal(item.id) : exportItems([item], "waypoint-event.ics")}>
                    <strong>{item.title}</strong>
                    <span>{item.startTime ? `${item.startTime} · ` : ""}{item.kind === "goal" ? "Goal deadline" : "Personal event"}</span>
                  </button>
                  {item.kind === "event" && <button className="upcoming-delete" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`}>&times;</button>}
                </article>
              ))}
            </div>
          ) : (
            <div className="calendar-empty"><span>&#9675;</span><p>No upcoming dates yet.</p></div>
          )}
        </section>
      </aside>
    </section>
  );
}

function SubgoalItem({
  item,
  depth,
  onToggle,
  onAdd,
  onDelete,
}: {
  item: GoalNode;
  depth: number;
  onToggle: (id: string, completed: boolean) => void;
  onAdd: (parentId: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  function submit() {
    if (!title.trim()) return;
    onAdd(item.id, title.trim());
    setTitle("");
    setAdding(false);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") submit();
    if (event.key === "Escape") {
      setTitle("");
      setAdding(false);
    }
  }

  return (
    <li className="subgoal-wrap">
      <div className="subgoal-row" style={{ "--depth": Math.min(depth, 4) } as React.CSSProperties}>
        <button
          className={`check-button ${item.completed ? "checked" : ""}`}
          onClick={() => onToggle(item.id, !item.completed)}
          aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.title}`}
          aria-pressed={item.completed}
        >
          <span>✓</span>
        </button>
        <span className={`subgoal-title ${item.completed ? "done" : ""}`}>{item.title}</span>
        <button className="small-action" onClick={() => setAdding((value) => !value)} aria-label={`Add a step under ${item.title}`}>+</button>
        <button className="small-action delete-action" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`}>×</button>
      </div>
      {adding && (
        <div className="inline-add" style={{ "--depth": Math.min(depth + 1, 4) } as React.CSSProperties}>
          <span className="branch-mark">↳</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleKey}
            onBlur={() => !title && setAdding(false)}
            placeholder="Break this step down…"
            aria-label="New nested sub-goal"
          />
          <button onMouseDown={(event) => event.preventDefault()} onClick={submit}>Add</button>
        </div>
      )}
      {item.children.length > 0 && (
        <ul className="nested-list">
          {item.children.map((child) => (
            <SubgoalItem
              key={child.id}
              item={child}
              depth={depth + 1}
              onToggle={onToggle}
              onAdd={onAdd}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function GoalTracker() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>();
  const [newStep, setNewStep] = useState("");
  const [notice, setNotice] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let storedGoals: Goal[] = [];
    let storedEvents: CalendarEvent[] = [];
    let storageError = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) storedGoals = JSON.parse(stored) as Goal[];
      const calendarStored = localStorage.getItem(CALENDAR_STORAGE_KEY);
      if (calendarStored) storedEvents = JSON.parse(calendarStored) as CalendarEvent[];
    } catch {
      storageError = true;
    }
    queueMicrotask(() => {
      setGoals(storedGoals);
      setCalendarEvents(storedEvents);
      if (storageError) setNotice("Your saved goals could not be opened.");
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }, [goals, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(calendarEvents));
  }, [calendarEvents, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selected = goals.find((goal) => goal.id === selectedId) ?? null;
  const completedGoals = goals.filter((goal) => progressOf(goal) === 100).length;
  const allLeafCounts = goals.reduce(
    (sum, goal) => {
      const counts = leafCounts(goal);
      return { done: sum.done + counts.done, total: sum.total + counts.total };
    },
    { done: 0, total: 0 },
  );

  const filteredGoals = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return goals.filter((goal) => {
      const completed = progressOf(goal) === 100;
      if (view === "completed" && !completed) return false;
      if (view !== "completed" && completed && view === "home") return false;
      return !normalized || goal.title.toLowerCase().includes(normalized) || goal.note.toLowerCase().includes(normalized);
    });
  }, [goals, query, view]);

  const nextStep = (() => {
    for (const goal of goals) {
      const step = nextOpenLeaf(goal);
      if (step && step.id !== goal.id) return { goal, step };
    }
    return null;
  })();

  function saveGoal(value: Pick<Goal, "title" | "note" | "targetDate" | "color">) {
    if (editingGoal) {
      setGoals((current) => current.map((goal) => (goal.id === editingGoal.id ? { ...goal, ...value } : goal)));
      setNotice("Goal updated");
    } else {
      const goal: Goal = {
        ...makeNode(value.title),
        ...value,
        createdAt: new Date().toISOString(),
      };
      setGoals((current) => [goal, ...current]);
      setSelectedId(goal.id);
      setView("goals");
      setNotice("Goal created — now add the first step");
    }
    setEditingGoal(undefined);
    setShowGoalForm(false);
  }

  function openEventForm(date = "") {
    setEventDate(date);
    setShowEventForm(true);
  }

  function saveEvent(value: Pick<CalendarEvent, "title" | "date" | "startTime" | "notes">) {
    setCalendarEvents((current) => [
      ...current,
      { id: makeId(), ...value, createdAt: new Date().toISOString() },
    ]);
    setShowEventForm(false);
    setEventDate("");
    setNotice("Calendar event added");
  }

  function deleteEvent(id: string) {
    const item = calendarEvents.find((event) => event.id === id);
    if (!item || !window.confirm(`Delete "${item.title}" from your Waypoint calendar?`)) return;
    setCalendarEvents((current) => current.filter((event) => event.id !== id));
    setNotice("Calendar event deleted");
  }

  function toggleNode(goalId: string, nodeId: string, completed: boolean) {
    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? nodeId === goal.id
            ? { ...goal, ...setBranchComplete(goal, completed) }
            : { ...goal, children: updateNode(goal.children, nodeId, (node) => setBranchComplete(node, completed)) }
          : goal,
      ),
    );
  }

  function addSubgoal(goalId: string, parentId: string | null, title: string) {
    const child = makeNode(title);
    setGoals((current) =>
      current.map((goal) => {
        if (goal.id !== goalId) return goal;
        if (!parentId) return { ...goal, children: [...goal.children, child] };
        return { ...goal, children: updateNode(goal.children, parentId, (node) => ({ ...node, children: [...node.children, child] })) };
      }),
    );
  }

  function deleteSubgoal(goalId: string, nodeId: string) {
    setGoals((current) => current.map((goal) => (goal.id === goalId ? { ...goal, children: removeNode(goal.children, nodeId) } : goal)));
  }

  function deleteGoal(goalId: string) {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal || !window.confirm(`Delete “${goal.title}” and all of its steps?`)) return;
    setGoals((current) => current.filter((item) => item.id !== goalId));
    setSelectedId(null);
    setNotice("Goal deleted");
  }

  function addTopLevelStep(event: FormEvent) {
    event.preventDefault();
    if (!selected || !newStep.trim()) return;
    addSubgoal(selected.id, null, newStep.trim());
    setNewStep("");
  }

  function exportGoals() {
    const backup = { version: 2, goals, calendarEvents };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `waypoint-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice("Backup downloaded");
  }

  function importGoals(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Goal[] | { goals: Goal[]; calendarEvents?: CalendarEvent[] };
        const incomingGoals = Array.isArray(parsed) ? parsed : parsed.goals;
        const incomingEvents = Array.isArray(parsed) ? [] : (parsed.calendarEvents ?? []);
        if (
          !Array.isArray(incomingGoals)
          || incomingGoals.some((goal) => !goal.id || !goal.title || !Array.isArray(goal.children))
          || !Array.isArray(incomingEvents)
          || incomingEvents.some((item) => !item.id || !item.title || !item.date)
        ) throw new Error();
        if ((goals.length || calendarEvents.length) && !window.confirm("Replace your current goals and calendar events with this backup?")) return;
        setGoals(incomingGoals);
        setCalendarEvents(incomingEvents);
        setSelectedId(null);
        setNotice("Backup restored");
      } catch {
        setNotice("That file is not a valid Waypoint backup");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const sectionTitle = view === "completed" ? "Completed goals" : view === "goals" ? "All goals" : "In progress";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => { setView("home"); setSelectedId(null); }} aria-label="Waypoint home">
          <span className="brand-mark"><i /></span>
          <span>Waypoint</span>
        </button>
        <nav aria-label="Main navigation">
          <button className={view === "home" ? "active" : ""} onClick={() => { setView("home"); setSelectedId(null); }}>
            <span className="nav-symbol">⌂</span>Today
          </button>
          <button className={view === "goals" ? "active" : ""} onClick={() => { setView("goals"); setSelectedId(null); }}>
            <span className="nav-symbol">◎</span>My goals
          </button>
          <button className={view === "calendar" ? "active" : ""} onClick={() => { setView("calendar"); setSelectedId(null); }}>
            <span className="nav-symbol">▦</span>Calendar
          </button>
          <button className={view === "completed" ? "active" : ""} onClick={() => { setView("completed"); setSelectedId(null); }}>
            <span className="nav-symbol">✓</span>Completed
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-note">
          <span className="privacy-icon">⌁</span>
          <p><strong>Private by design</strong>Your goals stay on this device.</p>
        </div>
        <div className="data-actions">
          <button onClick={exportGoals} disabled={!goals.length && !calendarEvents.length}>Backup</button>
          <button onClick={() => importInput.current?.click()}>Restore</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="today-date">{today}</p>
            <h1>{view === "calendar" ? "See the path ahead." : view === "completed" ? "A record of your wins." : view === "goals" ? "Every destination, one map." : "Make the next step obvious."}</h1>
          </div>
          <div className="topbar-actions">
            {view !== "calendar" && (
              <label className="search-field">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search goals" aria-label="Search goals" />
              </label>
            )}
            {view === "calendar" ? (
              <button className="button primary add-goal" onClick={() => openEventForm()}><span>+</span> New event</button>
            ) : (
              <button className="button primary add-goal" onClick={() => { setEditingGoal(undefined); setShowGoalForm(true); }}>
                <span>+</span> New goal
              </button>
            )}
          </div>
        </header>

        {!hydrated ? (
          <div className="loading-state" role="status"><span />Opening your goals…</div>
        ) : view === "calendar" ? (
          <CalendarView
            goals={goals}
            events={calendarEvents}
            onAdd={openEventForm}
            onDelete={deleteEvent}
            onSelectGoal={setSelectedId}
            onNotice={setNotice}
            onBackup={exportGoals}
            onRestore={() => importInput.current?.click()}
            hasData={Boolean(goals.length || calendarEvents.length)}
          />
        ) : (
          <>
            <section className="overview-grid" aria-label="Progress overview">
              <article className="overview-card hero-stat">
                <p>Overall progress</p>
                <div className="hero-stat-row">
                  <strong>{allLeafCounts.total ? Math.round((allLeafCounts.done / allLeafCounts.total) * 100) : 0}%</strong>
                  <span>{allLeafCounts.done} of {allLeafCounts.total} steps</span>
                </div>
                <div className="wide-progress"><i style={{ width: `${allLeafCounts.total ? (allLeafCounts.done / allLeafCounts.total) * 100 : 0}%` }} /></div>
              </article>
              <article className="overview-card mini-stat">
                <span className="stat-orb violet">◎</span>
                <div><strong>{goals.length}</strong><p>Active maps</p></div>
              </article>
              <article className="overview-card mini-stat">
                <span className="stat-orb green">✓</span>
                <div><strong>{completedGoals}</strong><p>Goals reached</p></div>
              </article>
            </section>

            {view === "home" && nextStep && !query && (
              <section className="focus-strip">
                <div className="focus-check">→</div>
                <div className="focus-copy">
                  <p className="eyebrow">Suggested next step</p>
                  <h2>{nextStep.step.title}</h2>
                  <span>Part of “{nextStep.goal.title}”</span>
                </div>
                <button onClick={() => toggleNode(nextStep.goal.id, nextStep.step.id, true)}>Mark done</button>
              </section>
            )}

            <section className="goals-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Your path</p>
                  <h2>{sectionTitle}</h2>
                </div>
                <span>{filteredGoals.length} {filteredGoals.length === 1 ? "goal" : "goals"}</span>
              </div>

              {filteredGoals.length ? (
                <div className="goal-grid">
                  {filteredGoals.map((goal) => {
                    const progress = progressOf(goal);
                    const count = leafCounts(goal);
                    const days = daysUntil(goal.targetDate);
                    return (
                      <button key={goal.id} className={`goal-card ${goal.color}`} onClick={() => setSelectedId(goal.id)}>
                        <div className="goal-card-top">
                          <span className="goal-accent">{progress === 100 ? "✓" : "↗"}</span>
                          <span className={`due-pill ${days !== null && days < 0 ? "overdue" : ""}`}>
                            {days === null ? "No deadline" : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                          </span>
                        </div>
                        <h3>{goal.title}</h3>
                        <p>{goal.note || "Add a note to remember why this matters."}</p>
                        <div className="goal-card-footer">
                          <div>
                            <span>{count.done}/{count.total} steps</span>
                            <div className="card-progress"><i style={{ width: `${progress}%` }} /></div>
                          </div>
                          <strong>{progress}%</strong>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-mark"><i /><i /><i /></div>
                  <h3>{query ? "No goals match that search" : view === "completed" ? "Your wins will collect here" : "Start with one meaningful destination"}</h3>
                  <p>{query ? "Try a different word." : view === "completed" ? "Finish every step in a goal and it will appear here." : "Name the outcome. Waypoint will help you turn it into smaller, clearer steps."}</p>
                  {!query && view !== "completed" && (
                    <button className="button primary" onClick={() => setShowGoalForm(true)}>Create my first goal</button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {selected && (
        <div className="detail-backdrop" onMouseDown={() => setSelectedId(null)} role="presentation">
          <aside className="goal-detail" onMouseDown={(event) => event.stopPropagation()} aria-label={`${selected.title} details`}>
            <div className={`detail-hero ${selected.color}`}>
              <div className="detail-actions">
                <button onClick={() => { setEditingGoal(selected); setShowGoalForm(true); }}>Edit</button>
                <button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Close goal details">×</button>
              </div>
              <p className="eyebrow">Destination</p>
              <h2>{selected.title}</h2>
              <p className="goal-note">{selected.note || "No note yet. Add one to capture why this goal matters to you."}</p>
              <div className="detail-progress-row">
                <div className="progress-ring" style={{ "--progress": `${progressOf(selected) * 3.6}deg` } as React.CSSProperties}>
                  <span>{progressOf(selected)}%</span>
                </div>
                <div><strong>{leafCounts(selected).done} of {leafCounts(selected).total}</strong><span>steps completed</span></div>
                <div className="target-date"><strong>{formatDate(selected.targetDate)}</strong><span>target date</span></div>
              </div>
            </div>

            <div className="detail-body">
              <div className="detail-section-heading">
                <div><p className="eyebrow">The route</p><h3>Steps & sub-goals</h3></div>
                {!!selected.children.length && (
                  <button className="text-button" onClick={() => toggleNode(selected.id, selected.id, progressOf(selected) !== 100)}>
                    {progressOf(selected) === 100 ? "Reopen all" : "Complete all"}
                  </button>
                )}
              </div>
              {selected.children.length ? (
                <ul className="subgoal-list">
                  {selected.children.map((item) => (
                    <SubgoalItem
                      key={item.id}
                      item={item}
                      depth={0}
                      onToggle={(id, completed) => toggleNode(selected.id, id, completed)}
                      onAdd={(parentId, title) => addSubgoal(selected.id, parentId, title)}
                      onDelete={(id) => deleteSubgoal(selected.id, id)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="steps-empty"><span>1</span><p><strong>What comes first?</strong>Add a clear action you can complete.</p></div>
              )}
              <form className="add-step-form" onSubmit={addTopLevelStep}>
                <span>+</span>
                <input value={newStep} onChange={(event) => setNewStep(event.target.value)} placeholder="Add a step or sub-goal…" aria-label="Add a step" />
                <button type="submit" disabled={!newStep.trim()}>Add</button>
              </form>
              <button className="delete-goal" onClick={() => deleteGoal(selected.id)}>Delete this goal</button>
            </div>
          </aside>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={view === "home" ? "active" : ""} onClick={() => { setView("home"); setSelectedId(null); }}><span>⌂</span>Today</button>
        <button className={view === "goals" ? "active" : ""} onClick={() => { setView("goals"); setSelectedId(null); }}><span>◎</span>Goals</button>
        <button className="mobile-add" onClick={() => {
          if (view === "calendar") openEventForm();
          else { setEditingGoal(undefined); setShowGoalForm(true); }
        }} aria-label={view === "calendar" ? "Add calendar event" : "Add goal"}>+</button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => { setView("calendar"); setSelectedId(null); }}><span>▦</span>Calendar</button>
        <button className={view === "completed" ? "active" : ""} onClick={() => { setView("completed"); setSelectedId(null); }}><span>✓</span>Done</button>
      </nav>

      <input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={importGoals} />
      {showGoalForm && <GoalForm initial={editingGoal} onSave={saveGoal} onClose={() => { setShowGoalForm(false); setEditingGoal(undefined); }} />}
      {showEventForm && <EventForm initialDate={eventDate} onSave={saveEvent} onClose={() => { setShowEventForm(false); setEventDate(""); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
