import type { Settings as ISettings, World } from '../../types/index';
import { System } from './System';

interface SettingsData {
  title?: string | null;
  desc?: string | null;
  image?: string | null;
  model?: string | null;
  avatar?: string | null;
  public?: boolean | null;
  playerLimit?: number | null;
}

interface SettingsChange {
  prev: unknown;
  value: unknown;
}

interface SettingsChanges {
  [key: string]: SettingsChange;
}

export class Settings extends System implements ISettings {
  title: string | null = null;
  desc: string | null = null;
  image: string | null = null;
  model?: { url: string } | string | null;
  avatar: string | null = null;
  public?: boolean;
  playerLimit: number | null = null;

  private changes: SettingsChanges | null = null;

  constructor(world: World) {
    super(world);
  }

  get(key: string): unknown {
    if (key in this) {
      return (this as Record<string, unknown>)[key];
    }
    return undefined;
  }

  set(key: string, value: unknown, broadcast = false): void {
    this.modify(key, value);
    if (broadcast && this.world.network && 'send' in this.world.network) {
      (this.world.network as { send: (type: string, data: unknown) => void }).send('settingsModified', { key, value });
    }
  }

  deserialize(data: SettingsData): void {
    this.title = data.title ?? null;
    this.desc = data.desc ?? null;
    this.image = data.image ?? null;
    this.model = data.model ? (typeof data.model === 'string' ? data.model : { url: data.model }) : undefined;
    this.avatar = data.avatar ?? null;
    this.public = data.public === null ? undefined : data.public;
    this.playerLimit = data.playerLimit ?? null;
    
    this.emit('change', {
      title: { value: this.title },
      desc: { value: this.desc },
      image: { value: this.image },
      model: { value: this.model },
      avatar: { value: this.avatar },
      public: { value: this.public },
      playerLimit: { value: this.playerLimit },
    });
  }

  serialize(): SettingsData {
    return {
      desc: this.desc,
      title: this.title,
      image: this.image,
      model: typeof this.model === 'object' ? this.model?.url : this.model,
      avatar: this.avatar,
      public: this.public === undefined ? null : this.public,
      playerLimit: this.playerLimit,
    };
  }

  override preFixedUpdate(): void {
    if (!this.changes) return;
    this.emit('change', this.changes);
    this.changes = null;
  }

  private modify(key: string, value: unknown): void {
    const currentValue = key in this ? (this as Record<string, unknown>)[key] : undefined;
    if (currentValue === value) return;
    const prev = currentValue;
    if (key in this) {
      (this as Record<string, unknown>)[key] = value;
    }
    
    if (!this.changes) this.changes = {};
    if (!this.changes[key]) this.changes[key] = { prev, value: null };
    this.changes[key].value = value;
  }


} 