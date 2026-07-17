'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AiQuestionDTO, HabitDTO, JournalDTO, NoteDTO, TaskDTO, UserDTO } from '@atlas/shared';
import {
  ApiError,
  AiQuestionsApi,
  AuthApi,
  HabitsApi,
  JournalApi,
  NotesApi,
  TasksApi,
} from '@/lib/api';

export default function Home() {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      setUser(await AuthApi.me());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (loading) {
    return (
      <div className="container center">
        <span className="muted">Loading…</span>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="brand">
        <h1>Atlas</h1>
        <span className="tag">your life, in one place</span>
      </div>
      {user ? <Dashboard user={user} onSignOut={() => setUser(null)} /> : <AuthGate onAuthed={setUser} />}
    </div>
  );
}

function AuthGate({ onAuthed }: { onAuthed: (u: UserDTO) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = mode === 'login' ? AuthApi.login : AuthApi.register;
      onAuthed(await fn({ email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card stack" style={{ width: 340 }} onSubmit={submit}>
        <div className="section-title" style={{ margin: 0 }}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </div>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        {error && <div className="error">{error}</div>}
        <button
          type="button"
          className="btn ghost"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

type Tab = 'today' | 'habits' | 'journal' | 'notes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'habits', label: 'Habits' },
  { id: 'journal', label: 'Journal' },
  { id: 'notes', label: 'Notes' },
];

function Dashboard({ user, onSignOut }: { user: UserDTO; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('today');

  async function signOut() {
    await AuthApi.logout();
    onSignOut();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Hi, {user.displayName ?? user.email}</span>
        <button className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </div>

      <AtlasAsks />

      <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? '' : 'secondary'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'today' && <TasksPanel />}
      {tab === 'habits' && <HabitsPanel />}
      {tab === 'journal' && <JournalPanel />}
      {tab === 'notes' && <NotesPanel />}
    </>
  );
}

// The self-curation loop: questions Atlas is asking, surfaced everywhere.
function AtlasAsks() {
  const [questions, setQuestions] = useState<AiQuestionDTO[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setQuestions(await AiQuestionsApi.list());
    } catch {
      /* not signed in yet / ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(q: AiQuestionDTO) {
    const text = (draft[q.id] ?? '').trim();
    if (!text) return;
    await AiQuestionsApi.answer(q.id, text);
    setDraft((d) => ({ ...d, [q.id]: '' }));
    await load();
  }

  async function dismiss(q: AiQuestionDTO) {
    await AiQuestionsApi.dismiss(q.id);
    await load();
  }

  if (questions.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title" style={{ marginLeft: 4 }}>
        ✦ Atlas wants to know
      </div>
      <div className="stack">
        {questions.map((q) => (
          <div key={q.id} className="card stack" style={{ borderColor: 'var(--accent-2)' }}>
            <div>{q.question}</div>
            {q.rationale && <div className="muted" style={{ fontSize: 12 }}>{q.rationale}</div>}
            <div className="row">
              <input
                className="input"
                placeholder="Your answer…"
                value={draft[q.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
              />
              <button className="btn" onClick={() => answer(q)}>
                Answer
              </button>
              <button className="btn ghost" onClick={() => dismiss(q)}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksPanel() {
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await TasksApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tasks');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await TasksApi.create({ title: title.trim() });
      setTitle('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add task');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: TaskDTO) {
    if (t.status === 'DONE') return;
    await TasksApi.complete(t.id);
    await load();
  }

  async function remove(t: TaskDTO) {
    await TasksApi.remove(t.id);
    await load();
  }

  const open = tasks.filter((t) => t.status !== 'DONE');
  const done = tasks.filter((t) => t.status === 'DONE');

  return (
    <>
      <div className="section-title">Today</div>
      <form className="row" onSubmit={addTask}>
        <input
          className="input"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          Add
        </button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginTop: 14 }}>
        {open.length === 0 && done.length === 0 ? (
          <span className="muted">No tasks yet. Add your first one above.</span>
        ) : (
          <>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={toggle} onRemove={remove} />
            ))}
            {done.length > 0 && (
              <>
                <div className="section-title" style={{ marginLeft: 0 }}>
                  Done
                </div>
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={toggle} onRemove={remove} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TaskRow({
  task,
  onToggle,
  onRemove,
}: {
  task: TaskDTO;
  onToggle: (t: TaskDTO) => void;
  onRemove: (t: TaskDTO) => void;
}) {
  return (
    <div className={`task ${task.status === 'DONE' ? 'done' : ''}`}>
      <button className="check" aria-label="complete" onClick={() => onToggle(task)} />
      <span className="title">{task.title}</span>
      {task.priority !== 'MEDIUM' && <span className={`pill ${task.priority}`}>{task.priority}</span>}
      <button className="btn ghost" onClick={() => onRemove(task)} aria-label="delete">
        ✕
      </button>
    </div>
  );
}

function HabitsPanel() {
  const [habits, setHabits] = useState<HabitDTO[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHabits(await HabitsApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load habits');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await HabitsApi.create({ name: name.trim() });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add habit');
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(h: HabitDTO) {
    await HabitsApi.log(h.id);
    await load();
  }

  async function remove(h: HabitDTO) {
    await HabitsApi.remove(h.id);
    await load();
  }

  return (
    <>
      <div className="section-title">Habits</div>
      <form className="row" onSubmit={addHabit}>
        <input
          className="input"
          placeholder="New habit (e.g. Gym, Read, Water)…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          Add
        </button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginTop: 14 }}>
        {habits.length === 0 ? (
          <span className="muted">No habits yet. Add one to start a streak.</span>
        ) : (
          habits.map((h) => (
            <HabitRow key={h.id} habit={h} onCheckIn={checkIn} onRemove={remove} />
          ))
        )}
      </div>
    </>
  );
}

function HabitRow({
  habit,
  onCheckIn,
  onRemove,
}: {
  habit: HabitDTO;
  onCheckIn: (h: HabitDTO) => void;
  onRemove: (h: HabitDTO) => void;
}) {
  return (
    <div className={`task ${habit.doneToday ? 'done' : ''}`}>
      <button className="check" aria-label="check in" onClick={() => onCheckIn(habit)} />
      <span className="title">{habit.name}</span>
      {habit.streak > 0 && <span className="pill">🔥 {habit.streak}d</span>}
      <button className="btn ghost" onClick={() => onRemove(habit)} aria-label="archive">
        ✕
      </button>
    </div>
  );
}

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];

function JournalPanel() {
  const [entries, setEntries] = useState<JournalDTO[]>([]);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await JournalApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load journal');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await JournalApi.create({ body: body.trim(), mood: mood ?? undefined });
      setBody('');
      setMood(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save entry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Journal</div>
      <form className="card stack" onSubmit={save}>
        <textarea
          className="input"
          rows={3}
          placeholder="What's on your mind today?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 6 }}>
            {MOODS.map((m, i) => (
              <button
                type="button"
                key={m}
                className={`btn ghost`}
                style={{ fontSize: 20, opacity: mood === i + 1 ? 1 : 0.4 }}
                onClick={() => setMood(i + 1)}
                aria-label={`mood ${i + 1}`}
              >
                {m}
              </button>
            ))}
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Save
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="stack" style={{ marginTop: 14 }}>
        {entries.map((e) => (
          <div key={e.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {e.entryDate.slice(0, 10)}
              </span>
              {e.mood && <span>{MOODS[e.mood - 1]}</span>}
            </div>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{e.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNotes(await NotesApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notes');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await NotesApi.create({ title: title.trim() || undefined, body: body.trim(), pinned });
      setTitle('');
      setBody('');
      setPinned(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save note');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Notes — what Atlas should know about you</div>
      <form className="card stack" onSubmit={save}>
        <input
          className="input"
          placeholder="Title (optional) — e.g. 'My goals', 'Sarah'"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input"
          rows={2}
          placeholder="A durable fact about you, your people, or your context…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="row muted" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pin (always in Atlas&apos;s context)
          </label>
          <button className="btn" type="submit" disabled={busy}>
            Save
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="stack" style={{ marginTop: 14 }}>
        {notes.map((n) => (
          <div key={n.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>
                {n.pinned && '📌 '}
                {n.title ?? 'Note'}
              </strong>
              <button className="btn ghost" onClick={() => NotesApi.remove(n.id).then(load)}>
                ✕
              </button>
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
