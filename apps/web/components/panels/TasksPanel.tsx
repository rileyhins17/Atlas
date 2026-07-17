'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TaskDTO } from '@atlas/shared';
import { ApiError, TasksApi } from '@/lib/api';

export function TasksPanel() {
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
