const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Hlc } = require('../out/sync/hlc');
const { CrdtEngine } = require('../out/sync/crdt_engine');
const { MerkleTree } = require('../out/sync/merkle');

function task(overrides = {}) {
    return {
        id: 'task-1', rowId: 'row-1', start: '2026-11-17T00:00:00.000Z',
        end: '2026-11-18T00:00:00.000Z', name: 'Initial', completion: 0,
        isSummary: false, isMilestone: false, isDeleted: false,
        lastUpdated: new Hlc(1000, 0, 'first'), fieldTimestamps: {}, metadata: {},
        ...overrides,
    };
}

test('HLC parses canonical UTC timestamps with hyphenated node ids', () => {
    const clock = Hlc.parse('2026-11-17T12:00:00.000Z-000A-node-one');
    assert.equal(clock.millis, Date.UTC(2026, 10, 17, 12));
    assert.equal(clock.counter, 10);
    assert.equal(clock.nodeId, 'node-one');
    assert.equal(clock.toString(), '2026-11-17T12:00:00.000Z-000A-node-one');
    assert.throws(() => Hlc.parse('invalid'), /Invalid HLC/);
});

test('HLC advances causality when wall time moves backwards', () => {
    const clock = new Hlc(1000, 2, 'local');
    assert.equal(clock.send(500).toString(), '1970-01-01T00:00:01.000Z-0003-local');
    assert.equal(clock.receive(new Hlc(1000, 5, 'remote'), 500).toString(),
        '1970-01-01T00:00:01.000Z-0006-local');
});

test('CRDT keeps newer task fields when stale operations arrive', () => {
    const result = new CrdtEngine().mergeTasks([task()], [
        { type: 'UPDATE_TASK', data: { id: 'task-1', name: 'New' }, timestamp: new Hlc(2000, 0, 'writer'), actorId: 'writer' },
        { type: 'UPDATE_TASK', data: { id: 'task-1', name: 'Stale' }, timestamp: new Hlc(1500, 0, 'writer'), actorId: 'writer' },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'New');
    assert.equal(result[0].fieldTimestamps.name.toString(), '1970-01-01T00:00:02.000Z-0000-writer');
});

test('CRDT applies batched task updates and deletions', () => {
    const clock = new Hlc(2000, 0, 'writer');
    const result = new CrdtEngine().mergeTasks([task()], [{
        type: 'BATCH_UPDATE', timestamp: clock, actorId: 'writer', data: { operations: [
            { type: 'UPDATE_TASK', data: { id: 'task-1', name: 'Renamed' }, timestamp: clock, actorId: 'writer' },
            { type: 'DELETE_TASK', data: { id: 'task-1' }, timestamp: clock, actorId: 'writer' },
        ] },
    }]);
    assert.deepEqual(result, []);
});

test('Merkle task hashes ignore metadata key insertion order', () => {
    const left = MerkleTree.computeTaskHash(task({ metadata: { nested: { z: 1, a: 2 }, list: [1, 2] } }));
    const right = MerkleTree.computeTaskHash(task({ metadata: { list: [1, 2], nested: { a: 2, z: 1 } } }));
    assert.equal(left, right);
    assert.notEqual(left, MerkleTree.computeTaskHash(task({ name: 'Changed' })));
    assert.equal(MerkleTree.computeRoot([]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(MerkleTree.computeRoot(['b', 'a']), MerkleTree.computeRoot(['a', 'b']));
});

test('CRDT ignores malformed boundary payloads while applying valid batch entries', () => {
    const clock = new Hlc(2000, 0, 'writer');
    const operation = (data) => ({ type: 'UPDATE_TASK', data, timestamp: clock, actorId: 'writer' });
    const result = new CrdtEngine().mergeTasks([task()], [
        operation(null), operation([]), operation({ id: 42, name: 'Invalid id' }),
        { type: 'BATCH_UPDATE', timestamp: clock, actorId: 'writer', data: { operations: [
            null, { type: 'UPDATE_TASK', data: { id: 'task-1', name: 'Missing clock' } },
            operation({ data: { id: 'task-1', name: 'Accepted', completion: 0.5 } }),
        ] } },
        { type: 'BATCH_UPDATE', timestamp: clock, actorId: 'writer', data: { operations: 'invalid' } },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Accepted');
    assert.equal(result[0].completion, 0.5);
});

test('CRDT preserves legacy date aliases and rejects wrong task field types', () => {
    const clock = new Hlc(2000, 0, 'writer');
    const result = new CrdtEngine().mergeTasks([task()], [{
        type: 'UPDATE_TASK', timestamp: clock, actorId: 'writer', data: {
            taskId: 'task-1', start_date: '2026-11-21T00:00:00.000Z', endDate: '2026-11-22T00:00:00.000Z',
            name: 123, completion: 'invalid', rowId: null,
        },
    }]);
    assert.equal(result[0].start, '2026-11-21T00:00:00.000Z');
    assert.equal(result[0].end, '2026-11-22T00:00:00.000Z');
    assert.equal(result[0].name, 'Initial');
    assert.equal(result[0].completion, 0);
    assert.equal(result[0].rowId, 'row-1');
});
