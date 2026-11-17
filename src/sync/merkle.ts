import * as CryptoJS from 'crypto-js';
import { Task } from '../models/dtos';

function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

export class MerkleTree {

    public static computeTaskHash(task: Task): string {
        // Create a deterministic representation of the task content
        // excluding volatile fields or those not synced if any.
        // The Dart implementation hashes these fields:
        // id, rowId, start, end, name, completion, isSummary, isMilestone,
        // resourceId, parentId, notes, isDeleted, metadata.

        const data = {
            id: task.id,
            rowId: task.rowId,
            start: task.start,
            end: task.end,
            name: task.name,
            completion: task.completion,
            isSummary: task.isSummary,
            isMilestone: task.isMilestone,
            resourceId: task.resourceId,
            parentId: task.parentId,
            notes: task.notes,
            isDeleted: task.isDeleted,
            metadata: task.metadata
        };

        const canonicalJson = MerkleTree.stringifyResultIds(data);
        return CryptoJS.SHA256(canonicalJson).toString();
    }

    private static stringifyResultIds(obj: unknown): string {
        if (obj === null || typeof obj !== 'object') {
            return JSON.stringify(obj);
        }
        
        if (isUnknownArray(obj)) {
            // Arrays should arguably be sorted too if order doesn't matter, 
            // but for lists of things like children, order might matter. 
            // For now, let's map them.
            return '[' + obj.map(item => MerkleTree.stringifyResultIds(item)).join(',') + ']';
        }

        const entries = Object.entries(obj).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
        const parts = entries.map(([key, value]) => {
            return `"${key}":${MerkleTree.stringifyResultIds(value)}`;
        });
        return '{' + parts.join(',') + '}';
    }

    public static computeRoot(hashes: string[]): string {
        if (hashes.length === 0) {
            return CryptoJS.SHA256('').toString();
        }
        
        // Sort hashes to be deterministic
        const sorted = [...hashes].sort();
        const joined = sorted.join(',');
        return CryptoJS.SHA256(joined).toString();
    }
}
