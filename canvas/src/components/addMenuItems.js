import {
  Bot,
  Link2,
  ListTodo,
  Music,
  RadioTower,
  SlidersHorizontal,
  StickyNote,
  Workflow,
} from 'lucide-react';
import { strings } from '../content/strings.js';

export const ADD_MENU_ITEM_IDS = [
  'sonic',
  'beat',
  'agent',
  'live',
  'flow',
  'link',
  'task',
  'note',
];

export function buildAddMenuItems({
  syncLock,
  activeProjectId,
  folderLinked,
}) {
  const needsProject = !activeProjectId;
  const syncLocked = syncLock !== 'live';
  const needsFolder = !folderLinked;

  const projectDisabled = needsProject || syncLocked;
  const folderItemDisabled = syncLocked || needsFolder;
  const linkDisabled = syncLocked;

  const projectReason = needsProject
    ? strings.addMenu.needProject
    : syncLocked
      ? strings.addMenu.syncLocked
      : '';
  const folderReason = syncLocked
    ? strings.addMenu.syncLocked
    : needsFolder
      ? strings.addMenu.needFolder
      : '';
  const linkReason = syncLocked ? strings.addMenu.syncLocked : '';

  return [
    {
      id: 'sonic',
      label: strings.addMenu.addSonicStudio,
      icon: SlidersHorizontal,
      disabled: projectDisabled,
      disabledReason: projectReason,
    },
    {
      id: 'beat',
      label: strings.addMenu.addBeat,
      icon: Music,
      disabled: projectDisabled,
      disabledReason: projectReason,
    },
    {
      id: 'agent',
      label: strings.addMenu.addAgent,
      icon: Bot,
      disabled: projectDisabled,
      disabledReason: projectReason,
    },
    {
      id: 'live',
      label: strings.addMenu.addLiveAgent,
      icon: RadioTower,
      disabled: projectDisabled,
      disabledReason: projectReason,
    },
    {
      id: 'flow',
      label: strings.addMenu.addFlow,
      icon: Workflow,
      disabled: projectDisabled,
      disabledReason: projectReason,
    },
    {
      id: 'link',
      label: strings.addMenu.addWebLink,
      icon: Link2,
      disabled: linkDisabled,
      disabledReason: linkReason,
    },
    {
      id: 'task',
      label: strings.addMenu.addTask,
      icon: ListTodo,
      disabled: folderItemDisabled,
      disabledReason: folderReason,
    },
    {
      id: 'note',
      label: strings.addMenu.addNote,
      icon: StickyNote,
      disabled: folderItemDisabled,
      disabledReason: folderReason,
    },
  ];
}
