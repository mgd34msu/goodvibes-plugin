import type { Task } from '../types/task';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onToggle, onDelete }: TaskItemProps) {
  return (
    <div className={`task-item${task.completed ? ' task-item--completed' : ''}`}>
      <div className="task-item__content">
        <button
          className="task-item__toggle"
          onClick={() => onToggle(task.id, !task.completed)}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          <span className="task-item__checkbox">{task.completed ? '\u2713' : ''}</span>
        </button>
        <div className="task-item__text">
          <span className="task-item__title">{task.title}</span>
          {task.description && (
            <span className="task-item__description">{task.description}</span>
          )}
        </div>
      </div>
      <button
        className="task-item__delete"
        onClick={() => onDelete(task.id)}
        aria-label="Delete task"
      >
        &times;
      </button>
    </div>
  );
}
