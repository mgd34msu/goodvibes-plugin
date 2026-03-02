import { TaskStore } from './store.js';

function formatTask(task: { id: string; title: string; description: string; status: string; createdAt: Date; updatedAt: Date }): string {
  return `  [${task.status.toUpperCase().padEnd(11)}] ${task.title} (id: ${task.id})`;
}

async function main(): Promise<void> {
  const store = new TaskStore();

  console.log('=== Task Manager Demo ===\n');

  // Step 1: Add 3 sample tasks
  console.log('--- Adding tasks ---');
  const task1 = store.create({ title: 'Design API', description: 'Define REST endpoints and data models' });
  const task2 = store.create({ title: 'Implement endpoints', description: 'Build the API handlers and business logic' });
  const task3 = store.create({ title: 'Write tests', description: 'Add unit and integration test coverage' });
  console.log(`Created: ${task1.title} (id: ${task1.id})`);
  console.log(`Created: ${task2.title} (id: ${task2.id})`);
  console.log(`Created: ${task3.title} (id: ${task3.id})`);

  // Step 2: List all tasks
  console.log('\n--- All tasks ---');
  const allTasks = store.getAll();
  allTasks.forEach((t) => console.log(formatTask(t)));

  // Step 3: Update one task to 'in_progress'
  console.log('\n--- Updating task to in_progress ---');
  const updated = store.update(task2.id, { status: 'in_progress' });
  console.log(`Updated: "${updated.title}" -> status: ${updated.status}`);

  // Step 4: Get tasks by status
  console.log('\n--- Tasks by status ---');
  const pending = store.getByStatus('pending');
  const inProgress = store.getByStatus('in_progress');
  console.log(`Pending (${pending.length}):`);
  pending.forEach((t) => console.log(formatTask(t)));
  console.log(`In Progress (${inProgress.length}):`);
  inProgress.forEach((t) => console.log(formatTask(t)));

  // Step 5: Delete one task
  console.log('\n--- Deleting a task ---');
  const deleted = store.delete(task3.id);
  console.log(`Deleted "${task3.title}": ${deleted}`);

  // Step 6: Show final count
  console.log('\n--- Final state ---');
  const finalTasks = store.getAll();
  finalTasks.forEach((t) => console.log(formatTask(t)));
  console.log(`\nTotal tasks remaining: ${store.count()}`);
}

main().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
