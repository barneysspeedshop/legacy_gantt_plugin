import * as CryptoJS from 'crypto-js';
import { Task } from '../models/dtos';

export class MerkleTree {

    public static computeTaskHash(task: Task): string {
        // Create a deterministic representation of the task content
        // excluding volatile fields or those not synced if any.
        // The Dart implementation hashes these fields:
        // id, rowId, start, end, name, completion, isSummary, isMilestone,
        // resourceId, parentId, notes, isDeleted, metadata.

        const data: any = {
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

    private static stringifyResultIds(obj: any): string {
        if (obj === null || typeof obj !== 'object') {
            return JSON.stringify(obj);
        }
        
        if (Array.isArray(obj)) {
            // Arrays should arguably be sorted too if order doesn't matter, 
            // but for lists of things like children, order might matter. 
            // For now, let's map them.
            return '[' + obj.map(item => MerkleTree.stringifyResultIds(item)).join(',') + ']';
        }

        const keys = Object.keys(obj).sort();
        const parts = keys.map(key => {
            return `"${key}":${MerkleTree.stringifyResultIds(obj[key])}`;
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
