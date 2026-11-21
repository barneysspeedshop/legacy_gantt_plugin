import WebSocket from 'ws';
import { Hlc } from './hlc';
import { Operation } from '../models/dtos';
import { randomUUID } from 'node:crypto';

export class GanttSyncClient {
    private ws: WebSocket | null = null;
    private hlc: Hlc;
    private nodeId: string;
    private tenantId: string;
    private url: string;

    constructor(url: string, tenantId: string) {
        this.url = url;
        this.tenantId = tenantId;
        this.nodeId = randomUUID();
        this.hlc = Hlc.zero(this.nodeId);
    }

    public connect(jwt: string) {
        const socket = new WebSocket(this.url, {
            headers: {
                'Authorization': `Bearer ${jwt}`
            }
        });
        this.ws = socket;

        socket.on('open', () => {
            console.log('Connected to Gantt Sync Server');
            this.send({
                type: 'subscribe',
                channel: this.tenantId
            });
        });

        socket.on('message', (data: WebSocket.Data) => {
            const msg: unknown = JSON.parse(data.toString());
            this.handleMessage(msg);
        });

        socket.on('error', (err) => {
            console.warn('Gantt Sync Server connection failed (offline mode):', err.message);
        });
    }

    private handleMessage(msg: unknown) {
        if (typeof msg !== 'object' || msg === null || !('type' in msg)) return;
        // 1. Causality (Receive Logic)
        if ('timestamp' in msg && typeof msg.timestamp === 'string' && msg.timestamp) {
            try {
                const remoteHlc = Hlc.parse(msg.timestamp);
                this.hlc = this.hlc.receive(remoteHlc, Date.now());
            } catch (e) {
                console.error('Failed to parse HLC', e);
            }
        }

        // 2. Initial Calibration
        if (msg.type === 'SUBSCRIBE_SUCCESS' || msg.type === 'AUTH_SUCCESS') {
            // Server might send a timestamp to calibrate
            console.log('Subscription success', msg);
        }

        // 3. Dispatch to CRDT Engine (todo)
    }

    public sendOperation(type: string, data: Operation['data']) {
        // Generate timestamp
        this.hlc = this.hlc.send(Date.now());
        
        const op: Operation = {
            type: type,
            data: data,
            timestamp: this.hlc,
            actorId: this.nodeId
        };

        this.send(op);
    }

    private send(msg: Operation | { type: 'subscribe'; channel: string }) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
}
