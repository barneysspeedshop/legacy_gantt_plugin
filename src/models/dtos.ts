import { Hlc } from '../sync/hlc';

export interface Task {
    id: string;
    rowId: string;
    start: string; // ISO String
    end: string;   // ISO String
    name?: string;
    completion: number;
    isSummary: boolean;
    isMilestone: boolean;
    resourceId?: string;
    parentId?: string;
    notes?: string;
    isDeleted: boolean;
    lastUpdated: Hlc;
    lastUpdatedBy?: string;
    fieldTimestamps: Record<string, Hlc>;
    metadata: Record<string, unknown>;
}

export interface Operation {
    type: string;
    data: unknown;
    timestamp: Hlc;
    actorId: string;
}

export interface Dependency {
    id: string;
    predecessorTaskId: string;
    successorTaskId: string;
    type: 'finishToStart' | 'startToStart' | 'finishToFinish' | 'startToFinish' | 'contained';
    lag?: number;
    isDeleted: boolean;
}
