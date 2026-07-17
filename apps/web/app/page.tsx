'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HabitDTO, TaskDTO, UserDTO } from '@atlas/shared';
import { ApiError, AuthApi, HabitsApi, TasksApi } from '@/lib/api';

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

function Dashboard({ user, onSignOut }: { user: UserDTO; onSignOut: () => void }) {
  const [tab, setTab] = useState<'today' | 'habits'>('today');

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

      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <button
          className={`btn ${tab === 'today' ? '' : 'secondary'}`}
          onClick={() => setTab('today')}
        >
          Today
        </button>
        <button
          className={`btn ${tab === 'habits' ? '' : 'secondary'}`}
          onClick={() => setTab('habits')}
        >
          Habits
        </button>
      </div>

      {tab === 'today' ? <TasksPanel /> : <HabitsPanel />}
    </>
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
