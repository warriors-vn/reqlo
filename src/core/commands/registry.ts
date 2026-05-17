import type { CommandDescriptor } from "./types";

type Listener = () => void;

class CommandRegistry {
  private map = new Map<string, CommandDescriptor>();
  private listeners = new Set<Listener>();
  private snapshot: CommandDescriptor[] = [];

  register(cmd: CommandDescriptor): () => void {
    this.map.set(cmd.id, cmd);
    this.emit();
    return () => this.unregister(cmd.id);
  }

  registerMany(cmds: CommandDescriptor[]): () => void {
    cmds.forEach((c) => this.map.set(c.id, c));
    this.emit();
    return () => {
      cmds.forEach((c) => this.map.delete(c.id));
      this.emit();
    };
  }

  unregister(id: string) {
    if (this.map.delete(id)) this.emit();
  }

  get(id: string): CommandDescriptor | undefined {
    return this.map.get(id);
  }

  all(): CommandDescriptor[] {
    return this.snapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.snapshot = Array.from(this.map.values());
    this.listeners.forEach((l) => l());
  }
}

export const commandRegistry = new CommandRegistry();
