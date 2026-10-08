export type DependencyNode = {
  id: string;
  dependencies: readonly string[];
};

export function canDependOn(
  tasks: readonly DependencyNode[],
  taskId: string,
  dependencyId: string,
): boolean {
  if (taskId === dependencyId) return false;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (!byId.has(taskId) || !byId.has(dependencyId)) return false;
  return !reaches(byId, dependencyId, taskId, new Set());
}

export function findCycle(tasks: readonly DependencyNode[]): string[] | null {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const state = new Map<string, "visiting" | "done">();

  function visit(id: string, stack: string[]): string[] | null {
    const mark = state.get(id);
    if (mark === "done") return null;
    if (mark === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    state.set(id, "visiting");
    stack.push(id);
    for (const dependencyId of byId.get(id)?.dependencies ?? []) {
      if (!byId.has(dependencyId)) continue;
      const cycle = visit(dependencyId, stack);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  }

  for (const task of tasks) {
    const cycle = visit(task.id, []);
    if (cycle) return cycle;
  }
  return null;
}

export function groupByDependencyDepth<T extends DependencyNode>(tasks: readonly T[]): T[][] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depth = new Map<string, number>();

  function depthOf(id: string, trail: Set<string>): number {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (trail.has(id)) return 0;
    trail.add(id);
    const dependencies = byId.get(id)?.dependencies ?? [];
    const value =
      dependencies.length === 0
        ? 0
        : 1 + Math.max(...dependencies.map((dependencyId) => (byId.has(dependencyId) ? depthOf(dependencyId, trail) : 0)));
    trail.delete(id);
    depth.set(id, value);
    return value;
  }

  const buckets = new Map<number, T[]>();
  for (const task of tasks) {
    const level = depthOf(task.id, new Set());
    const bucket = buckets.get(level) ?? [];
    bucket.push(task);
    buckets.set(level, bucket);
  }

  return [...buckets.keys()]
    .sort((left, right) => left - right)
    .map((level) => buckets.get(level) ?? []);
}

function reaches(
  byId: ReadonlyMap<string, DependencyNode>,
  start: string,
  target: string,
  trail: Set<string>,
): boolean {
  if (start === target) return true;
  if (trail.has(start)) return false;
  trail.add(start);
  const node = byId.get(start);
  if (!node) return false;
  return node.dependencies.some((next) => reaches(byId, next, target, trail));
}
