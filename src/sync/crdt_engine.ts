import { Task, Operation } from '../models/dtos';
import { Hlc } from './hlc';

export class CrdtEngine {

    public mergeTasks(currentTasks: Task[], operations: Operation[]): Task[] {
        const taskMap = new Map<string, Task>();
        for (const t of currentTasks) {
            taskMap.set(t.id, t);
        }

        for (const op of operations) {
            if (op.type === 'BATCH_UPDATE') {
                const subOps = op.data.operations || [];
                for (const sub of subOps) {
                    this.applyOp(taskMap, sub);
                }
            } else {
                this.applyOp(taskMap, op);
            }
        }

        // Return non-deleted tasks
        return Array.from(taskMap.values()).filter(t => !t.isDeleted);
    }

    private applyOp(taskMap: Map<string, Task>, op: Operation) {
        if (op.type === 'DELETE_TASK') {
            const taskId = op.data.id || op.data.taskId;
            if (!taskId) return;

            const existing = taskMap.get(taskId);
            const base = existing || this.createTombstone(taskId);

            // Force update isDeleted
            const changes = { isDeleted: true };
            const merged = this.mergeTask(base, op, changes);
            taskMap.set(taskId, merged);
            return;
        }

        const effectiveData = op.data.data || op.data;
        const taskId = effectiveData.id || effectiveData.taskId;
        if (!taskId) return;

        const existing = taskMap.get(taskId);
        const base = existing || this.createEmptyTask(taskId);

        // Assume resurrection if not explicitly deleting
        const mergeData = { ...effectiveData, isDeleted: false };
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

    private mergeTask(target: Task, op: Operation, changes: any): Task {
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
        const isDeleted = Object.prototype.hasOwnProperty.call(changes, 'isDeleted') ? updateField('isDeleted', changes.isDeleted, target.isDeleted) : target.isDeleted;
        const rowId = changes.rowId !== undefined ? updateField('rowId', changes.rowId, target.rowId) : target.rowId;
        const start = changes.start || changes.startDate || changes.start_date;
        const newStart = start ? updateField('start', start, target.start) : target.start;
        const end = changes.end || changes.endDate || changes.end_date;
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
