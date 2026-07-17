'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HabitDTO } from '@atlas/shared';
import { ApiError, HabitsApi } from '@/lib/api';

export function HabitsPanel() {
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
