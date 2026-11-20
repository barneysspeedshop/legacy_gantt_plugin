import { Task, Operation } from '../models/dtos';
import { Hlc } from './hlc';

type TaskChanges = Partial<Pick<Task, 'isDeleted' | 'rowId' | 'start' | 'end' | 'name' | 'completion'>>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOperation(value: unknown): Operation | undefined {
    if (!isRecord(value) || typeof value.type !== 'string' ||
        !(value.timestamp instanceof Hlc) || typeof value.actorId !== 'string') return undefined;
    return { type: value.type, data: value.data, timestamp: value.timestamp, actorId: value.actorId };
}

function taskChanges(data: Record<string, unknown>): TaskChanges {
    const firstDate = (...values: unknown[]) => values.find((value): value is string =>
        typeof value === 'string' && value.length > 0);
    return {
        isDeleted: typeof data.isDeleted === 'boolean' ? data.isDeleted : undefined,
        rowId: typeof data.rowId === 'string' ? data.rowId : undefined,
        start: firstDate(data.start, data.startDate, data.start_date),
        end: firstDate(data.end, data.endDate, data.end_date),
        name: typeof data.name === 'string' ? data.name : undefined,
        completion: typeof data.completion === 'number' ? data.completion : undefined,
    };
}

export class CrdtEngine {

    public mergeTasks(currentTasks: Task[], operations: Operation[]): Task[] {
        const taskMap = new Map<string, Task>();
        for (const t of currentTasks) {
            taskMap.set(t.id, t);
        }

        for (const op of operations) {
            if (op.type === 'BATCH_UPDATE') {
                const subOps: unknown[] = isRecord(op.data) && Array.isArray(op.data.operations) ? op.data.operations : [];
                for (const sub of subOps) {
                    const parsed = parseOperation(sub);
                    if (parsed) this.applyOp(taskMap, parsed);
                }
            } else {
                this.applyOp(taskMap, op);
            }
        }

        // Return non-deleted tasks
        return Array.from(taskMap.values()).filter(t => !t.isDeleted);
    }

    private applyOp(taskMap: Map<string, Task>, op: Operation) {
        if (!isRecord(op.data)) return;
        if (op.type === 'DELETE_TASK') {
            const taskId = op.data.id || op.data.taskId;
            if (typeof taskId !== 'string' || !taskId) return;

            const existing = taskMap.get(taskId);
            const base = existing || this.createTombstone(taskId);

            // Force update isDeleted
            const changes = { isDeleted: true };
            const merged = this.mergeTask(base, op, changes);
            taskMap.set(taskId, merged);
            return;
        }

        const effectiveData = isRecord(op.data.data) ? op.data.data : op.data;
        const taskId = effectiveData.id || effectiveData.taskId;
        if (typeof taskId !== 'string' || !taskId) return;

        const existing = taskMap.get(taskId);
        const base = existing || this.createEmptyTask(taskId);

        // Assume resurrection if not explicitly deleting
        const mergeData = { ...taskChanges(effectiveData), isDeleted: false };
        const merged = this.mergeTask(base, op, mergeData);
        taskMap.set(taskId, merged);
    }

    private createTombstone(taskId: string): Task {
        return {
            id: taskId,
            rowId: '',
            start: new Date(0).toISOString(),
            end: new Date(0).toISOString(),
            completion: 0,
            isSummary: false,
            isMilestone: false,
            isDeleted: true,
            lastUpdated: Hlc.zero('unknown'),
            fieldTimestamps: {},
            metadata: {}
        };
    }

    private createEmptyTask(taskId: string): Task {
        return {
            id: taskId,
            rowId: '',
            start: new Date(0).toISOString(),
            end: new Date(0).toISOString(),
            completion: 0,
            isSummary: false,
            isMilestone: false,
            isDeleted: true, // Will be resurrected
            lastUpdated: Hlc.zero('unknown'),
            fieldTimestamps: {},
            metadata: {}
        };
    }

    private mergeTask(target: Task, op: Operation, changes: TaskChanges): Task {
        const newTimestamps = { ...target.fieldTimestamps };
        const opTimestamp = op.timestamp;

        const shouldUpdate = (field: string): boolean => {
            const lastHlcStr = newTimestamps[field]; // In Dart this is map<String, Hlc>, here we need to ensure type
            
            // If we stored HLC as object in DTO, we can use it. But serialized JSON usually has strings.
            // Let's assume strict HLC object in memory.
            const lastHlc = lastHlcStr ?? target.lastUpdated;
            return opTimestamp.compare(lastHlc) >= 0;
        };

        const updateField = <T>(field: string, candidate: T, current: T): T => {
            if (shouldUpdate(field)) {
                newTimestamps[field] = opTimestamp;
                return candidate;
            }
            return current;
        };

        // Merge logic mirroring Dart implementation
        const isDeleted = changes.isDeleted !== undefined ? updateField('isDeleted', changes.isDeleted, target.isDeleted) : target.isDeleted;
        const rowId = changes.rowId !== undefined ? updateField('rowId', changes.rowId, target.rowId) : target.rowId;
        const start = changes.start;
        const newStart = start ? updateField('start', start, target.start) : target.start;
        const end = changes.end;
        const newEnd = end ? updateField('end', end, target.end) : target.end;
        const name = changes.name !== undefined ? updateField('name', changes.name, target.name) : target.name;
        const completion = changes.completion !== undefined ? updateField('completion', changes.completion, target.completion) : target.completion;
        // ... mapped other fields similarly

        const lastUpdated = opTimestamp.compare(target.lastUpdated) > 0 ? opTimestamp : target.lastUpdated;

        return {
            ...target,
            rowId,
            start: newStart,
            end: newEnd,
            name,
            completion,
            isDeleted,
            lastUpdated,
            fieldTimestamps: newTimestamps,
            // ... copy other fields
            metadata: target.metadata // Simplified for now
        };
    }
}
