export const isTreadmill = (exercise, item) => item?.kind === 'treadmill' || /treadmill/i.test(exercise?.name || '');
export const exerciseName = exercise => isTreadmill(exercise) ? 'Treadmill' : exercise.name;
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function hasRecord(item) {
  if (item.kind === 'treadmill') return (numeric(item.miles) && item.miles > 0) || (numeric(item.durationMinutes) && item.durationMinutes > 0);
  return (item.sets || []).some(set => numeric(set.reps) || numeric(set.weight));
}

export function latestEntry(workouts, exerciseId, exclude, asOf) {
  const ordered = workouts.filter(w => w.status === 'completed' && w.id !== exclude && (!asOf || w.date <= asOf))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const workout of ordered) {
    const item = workout.items.find(i => i.exerciseId === exerciseId && hasRecord(i));
    if (item) return { workout, item };
  }
  return null;
}

const dayNumber = value => {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};
export function daysSince(workouts, exerciseId, today, exclude) {
  const entry = latestEntry(workouts, exerciseId, exclude, today);
  return entry ? dayNumber(today) - dayNumber(entry.workout.date) : null;
}
export function recencyLabel(days) {
  return days === null ? 'Not logged yet' : days === 0 ? 'Today · 0 days ago' : `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function visibleExercises(exercises, workouts) {
  const used = new Set(workouts.filter(w => w.status !== 'deleted').flatMap(w => w.items
    .filter(item => hasRecord(item) || w.status === 'in_progress').map(item => item.exerciseId)));
  return exercises.filter(e => isTreadmill(e) || used.has(e.id))
    .sort((a, b) => exerciseName(a).localeCompare(exerciseName(b)));
}

export function newExerciseItem(exercise, previous, uuid) {
  if (isTreadmill(exercise)) return {
    id: uuid(), exerciseId: exercise.id, kind: 'treadmill', miles: null, durationMinutes: null, inclinePercent: null,
  };
  const oldSets = previous?.sets || [];
  return {
    id: uuid(), exerciseId: exercise.id,
    sets: Array.from({ length: 3 }, (_, index) => {
      const source = oldSets[index] || oldSets.at(-1);
      return { id: uuid(), weight: source?.weight ?? null, reps: source?.reps ?? null };
    }),
  };
}

export function resizeSets(item, count, uuid) {
  if (!Number.isInteger(count) || count < 1 || count > 20 || item.kind === 'treadmill') return false;
  item.sets ||= [];
  while (item.sets.length < count) {
    const source = item.sets.at(-1);
    item.sets.push({ id: uuid(), weight: source?.weight ?? null, reps: source?.reps ?? null });
  }
  item.sets.length = count;
  return true;
}

export function commonSetValue(item, field) {
  const sets = item.sets || [];
  return sets.length > 0 && sets.every(set => set[field] === sets[0][field]) ? sets[0][field] ?? '' : '';
}

export function itemSummary(item, exercise) {
  if (isTreadmill(exercise, item) && item.kind === 'treadmill') {
    return [item.miles == null ? null : `${item.miles} mi`, item.durationMinutes == null ? null : `${item.durationMinutes} min`,
      item.inclinePercent == null ? null : `${item.inclinePercent}% incline`].filter(Boolean).join(' · ') || 'No treadmill details recorded';
  }
  return (item.sets || []).map(set => `${set.weight ?? '—'} lb × ${set.reps ?? '—'}`).join(' · ') || 'No sets recorded';
}

export function createWorkoutEdit(workout, exercises) {
  return {
    workout: JSON.parse(JSON.stringify(workout)),
    exercises: JSON.parse(JSON.stringify(exercises)),
    baseUpdatedAt: workout.updatedAt,
  };
}

export function commitWorkoutEdit(state, edit, now = Date.now()) {
  const current = state.workouts.find(workout => workout.id === edit.workout.id);
  if (!current || current.status === 'deleted' || current.updatedAt !== edit.baseUpdatedAt) return false;
  const saved = JSON.parse(JSON.stringify(edit.workout));
  // Reconcile exercises created on another device while the editor was open.
  for (const exercise of edit.exercises) {
    if (!saved.items.some(item => item.exerciseId === exercise.id)) continue;
    const existing = state.exercises.find(e => e.id === exercise.id || e.name.toLowerCase() === exercise.name.toLowerCase());
    if (!existing) state.exercises.push(exercise);
    else if (existing.id !== exercise.id) for (const item of saved.items) {
      if (item.exerciseId === exercise.id) item.exerciseId = existing.id;
    }
  }
  Object.assign(current, saved, {
    id: current.id, status: current.status, source_key: current.source_key,
    updatedAt: Math.max(now, (current.updatedAt || 0) + 1),
  });
  return true;
}
