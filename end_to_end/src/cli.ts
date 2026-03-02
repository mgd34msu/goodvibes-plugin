import { TaskStore } from './store.js';

async function main(): Promise<void> {
  console.log('=== Task Manager CLI Demo ===\n');

  // 1. Create a new TaskStore
  const store = new TaskStore();
  console.log('Created new TaskStore.');

  // 2. Add 3 sample tasks
  console.log('\n--- Adding Tasks ---');
  const task1 = store.addTask('Design API');
  console.log(`Added: [${task1.id}] "${task1.title}" (${task1.status})`);

  const task2 = store.addTask('Implement endpoints');
  console.log(`Added: [${task2.id}] "${task2.title}" (${task2.status})`);

  const task3 = store.addTask('Write tests');
  console.log(`Added: [${task3.id}] "${task3.title}" (${task3.status})`);

  // 3. List all tasks
  console.log('\n--- All Tasks ---');
  const allTasks = store.listTasks();
  allTasks.forEach((task) => {
    console.log(`  [${task.id}] "${task.title}" — ${task.status} (created: ${task.createdAt.toISOString()})`);
  });

  // 4. Update one task to 'in_progress'
  console.log('\n--- Updating Task ---');
  const updated = store.updateTask(task1.id, { status: 'in_progress' });
  if (updated) {
    console.log(`Updated: [${updated.id}] "${updated.title}" -> ${updated.status}`);
  }

  // 5. Get tasks by status
  console.log('\n--- Tasks by Status ---');
  const pendingTasks = store.getTasksByStatus('pending');
  console.log(`Pending (${pendingTasks.length}):`);
  pendingTasks.forEach((t) => console.log(`  - "${t.title}"`));

  const inProgressTasks = store.getTasksByStatus('in_progress');
  console.log(`In Progress (${inProgressTasks.length}):`);
  inProgressTasks.forEach((t) => console.log(`  - "${t.title}"`));

  // 6. Delete one task
  console.log('\n--- Deleting Task ---');
  const deleted = store.deleteTask(task3.id);
  console.log(`Deleted task [${task3.id}]: ${deleted ? 'success' : 'not found'}`);

  // 7. Show final count
  console.log('\n--- Final Count ---');
  const finalTasks = store.listTasks();
  console.log(`Remaining tasks: ${finalTasks.length}`);
  finalTasks.forEach((t) => console.log(`  [${t.id}] "${t.title}" — ${t.status}`));

  console.log('\n=== Demo Complete ===');
}

main().catch((err: unknown) => {
  console.error('Error running demo:', err);
  process.exit(1);
});
