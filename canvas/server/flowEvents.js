import { EventEmitter } from 'node:events';

const events = new EventEmitter();
events.setMaxListeners(100);

export function publishFlowEvent(event) {
  events.emit('flow', event);
}

export function subscribeFlowEvents(listener) {
  events.on('flow', listener);
  return () => events.off('flow', listener);
}

