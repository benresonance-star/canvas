import React, { useState } from 'react';
import { ListTodo } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import {
  countOpenUserTasks,
  getUserTaskBodyPreview,
  partitionUserTasksByStatus,
} from '../domain/taskCard.js';

function TaskRow({ projectName, task, onOpen }) {
  return (
    <button
      type="button"
      className="w-full text-left p-2 rounded hover:bg-surface-muted"
      onClick={() => onOpen?.(task.id)}
    >
      <div className="text-[10px] text-muted truncate">{projectName}</div>
      <div className="text-xs text-primary">{task.name}</div>
      <div className="text-[10px] text-muted line-clamp-2">{getUserTaskBodyPreview(task)}</div>
    </button>
  );
}

export function TaskFlag({ projectName, tasks = [], onOpenTaskCard }) {
  const [open, setOpen] = useState(false);
  const count = countOpenUserTasks(tasks);
  const { important, general } = partitionUserTasksByStatus(tasks);

  const handleOpen = (cardId) => {
    onOpenTaskCard?.(cardId);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={strings.tasks.flagLabel}
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-1 text-muted hover:text-secondary"
      >
        <ListTodo size={15} strokeWidth={1.5} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-on-accent text-[9px] flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-h-80 overflow-y-auto bg-surface border border-border rounded-lg shadow-2xl p-2 z-50">
          <div className="p-2">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.tasks.dropdownTitle}
            </span>
          </div>
          {count === 0 ? (
            <p className="p-3 text-xs text-muted">{strings.tasks.empty}</p>
          ) : (
            <>
              {important.length > 0 && (
                <>
                  <div className="sans text-[10px] uppercase tracking-wider text-muted px-2 pt-1 text-[#c45c5c]">
                    {strings.tasks.sectionImportant}
                  </div>
                  {important.map((task) => (
                    <TaskRow
                      key={task.id}
                      projectName={projectName}
                      task={task}
                      onOpen={handleOpen}
                    />
                  ))}
                </>
              )}
              {general.length > 0 && (
                <>
                  <div className="sans text-[10px] uppercase tracking-wider text-muted px-2 pt-2 text-[#d4924a]">
                    {strings.tasks.sectionGeneral}
                  </div>
                  {general.map((task) => (
                    <TaskRow
                      key={task.id}
                      projectName={projectName}
                      task={task}
                      onOpen={handleOpen}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
