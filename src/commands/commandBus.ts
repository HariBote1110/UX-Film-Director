/**
 * CommandBus: a registry mapping a commandId to a handler function.
 *
 * This decouples input sources (keyboard shortcuts, future Remote Control
 * Deck messages, etc.) from the store actions they trigger. Any input
 * source only needs to know the commandId; it never touches the store
 * directly.
 */
export type CommandHandler<TPayload = unknown> = (payload?: TPayload) => void;

export interface CommandBus {
  /** Registers a handler for a commandId, overwriting any existing one. */
  register: (commandId: string, handler: CommandHandler) => void;
  /** Removes the handler registered for a commandId, if any. */
  unregister: (commandId: string) => void;
  /** Returns whether a handler is registered for the commandId. */
  has: (commandId: string) => boolean;
  /**
   * Executes the handler registered for commandId with the given payload.
   * Unregistered commandIds are safely ignored (no throw) and return false.
   */
  execute: (commandId: string, payload?: unknown) => boolean;
}

export const createCommandBus = (): CommandBus => {
  const handlers = new Map<string, CommandHandler>();

  return {
    register: (commandId, handler) => {
      handlers.set(commandId, handler);
    },
    unregister: (commandId) => {
      handlers.delete(commandId);
    },
    has: (commandId) => handlers.has(commandId),
    execute: (commandId, payload) => {
      const handler = handlers.get(commandId);
      if (!handler) return false;
      handler(payload);
      return true;
    },
  };
};

/** Shared singleton bus used across the renderer application. */
export const commandBus = createCommandBus();
