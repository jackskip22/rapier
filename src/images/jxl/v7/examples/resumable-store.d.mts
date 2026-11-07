import type {
  AdvanceOptions, Checkpoint, ResumableInput, ResumableOperation, ResumableStore, StartOptions,
} from 'rapier-jxl/resumable';

type Awaitable<T> = T | PromiseLike<T>;
export type StoreVersion = string | number;
/** Keep this whole JSON value. The checkpoint belongs to the public resumable driver. */
export interface StoredJob<Input extends ResumableInput = ResumableInput> {
  readonly kind: 'resumable-job';
  readonly input: Input;
  readonly checkpoint: Checkpoint;
  readonly done: boolean;
  readonly canceled: boolean;
  /** Identity of this host CAS write, used only to reconcile a lost acknowledgement. */
  readonly commit: string;
}
export interface Snapshot<Value> {
  readonly value: Value | null;
  readonly version: StoreVersion | null;
}
type PartStore<Store> = Store extends unknown ? Omit<Store, 'readSource'> : never;
/** The public immutable-part store plus one linearizable host record per job. */
export type DurableStore<Input extends ResumableInput = ResumableInput> = PartStore<ResumableStore> & {
  /** Never-created is null/null. Deletion retains a new, non-null versioned tombstone. */
  getVersioned(key: string): Awaitable<Snapshot<StoredJob<Input>>>;
  /** Versions never repeat; every successful write returns a fresh version. */
  compareAndSet(key: string, expectedVersion: StoreVersion | null, value: StoredJob<Input>): Awaitable<
    {readonly ok: true; readonly version: StoreVersion} | {readonly ok: false}
  >;
};
type InputOf<Operation extends ResumableOperation> = StartOptions<Operation>['input'];
type JobOf<Operation extends ResumableOperation> = StoredJob<InputOf<Operation>>;
export interface DriverOptions<Operation extends ResumableOperation> {
  readonly operation: Operation;
  readonly store: DurableStore<InputOf<Operation>>;
  /** Resolve this saved immutable generation; never read a newer replacement under the same media key. */
  readonly readSource: (input: InputOf<Operation>, offset: number, length: number) => Awaitable<Uint8Array>;
}
export type StartCommand<Operation extends ResumableOperation> = Omit<StartOptions<Operation>, 'operation' | 'store'> & {
  /** Defaults to null; replacing a job requires its current version explicitly. */
  readonly expectedVersion?: StoreVersion | null;
  readonly signal?: AbortSignal;
};
export interface FencedCommand {
  readonly generation: string;
  readonly expectedVersion: StoreVersion | null;
  readonly signal?: AbortSignal;
}
export interface AdvanceCommand extends FencedCommand, Pick<AdvanceOptions, 'budget'> {}
export type Stale<Value> = Snapshot<Value> & {readonly outcome: 'stale'};
export type TransitionOutcome<Value> = Stale<Value> | {
  readonly outcome: 'committed' | 'observed';
  readonly value: Value;
  readonly version: StoreVersion;
};
export type FinishOutcome<Operation extends ResumableOperation> = Stale<JobOf<Operation>> | {
  readonly outcome: 'finished';
  readonly value: JobOf<Operation>;
  readonly version: StoreVersion;
  readonly result: Awaited<ReturnType<Operation>>;
};
export interface DurableDriver<Operation extends ResumableOperation> {
  readonly inspect: (key: string) => Promise<Snapshot<JobOf<Operation>>>;
  readonly start: (key: string, command: StartCommand<Operation>) => Promise<TransitionOutcome<JobOf<Operation>>>;
  readonly advance: (key: string, command: AdvanceCommand) => Promise<TransitionOutcome<JobOf<Operation>>>;
  /** Whole-result assembly is outside the bounded advance; authority is checked again before returning bytes. */
  readonly finish: (key: string, command: FencedCommand) => Promise<FinishOutcome<Operation>>;
  /** A saved completion wins; an earlier cancellation fences the worker's checkpoint save. */
  readonly cancel: (key: string, command: FencedCommand) => Promise<TransitionOutcome<JobOf<Operation>>>;
}
export function createDurableDriver<Operation extends ResumableOperation>(
  options: DriverOptions<Operation>,
): DurableDriver<Operation>;
