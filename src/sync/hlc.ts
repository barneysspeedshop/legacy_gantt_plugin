export class Hlc {
    public readonly millis: number;
    public readonly counter: number;
    public readonly nodeId: string;

    constructor(millis: number, counter: number, nodeId: string) {
        this.millis = millis;
        this.counter = counter;
        this.nodeId = nodeId;
    }

    public static zero(nodeId: string): Hlc {
        return new Hlc(0, 0, nodeId);
    }

    public static parse(hlcString: string): Hlc {
        const parts = hlcString.split('-');
        // Expecting minimum 3 parts: ISO-Counter-NodeId...
        // But ISO might contain hyphens (YYYY-MM-DD...).
        // A safer way is to use regex similar to Dart implementation.

        // Standard regex from Dart: ^(.+)-([0-9a-fA-F]{4})-(.+)$
        const regex = /^(.+)-([0-9a-fA-F]{4})-(.+)$/;
        const match = hlcString.match(regex);

        if (match) {
            const isoTimestamp = match[1];
            const counterString = match[2];
            const nodeId = match[3];

            const normalizedIso = isoTimestamp.endsWith('Z') ? isoTimestamp : `${isoTimestamp}Z`;
            const millis = Date.parse(normalizedIso);
            const counter = parseInt(counterString, 16);

            if (isNaN(millis)) {
                 throw new Error(`Invalid timestamp in HLC: ${hlcString}`);
            }

            return new Hlc(millis, counter, nodeId);
        }

        throw new Error(`Invalid HLC format: ${hlcString}`);
    }

    public toString(): string {
        const date = new Date(this.millis);
        const iso = date.toISOString(); // Ends with Z usually
        // Remove Z if we want to match strictly, but standard ISO usually has it.
        // The Dart impl: date.toIso8601String() usually includes Z if UTC.
        // format: ISO-CounterHex-NodeId

        const counterHex = this.counter.toString(16).padStart(4, '0').toUpperCase();
        return `${iso}-${counterHex}-${this.nodeId}`;
    }

    public send(wallTimeMillis: number): Hlc {
        const newMillis = Math.max(this.millis, wallTimeMillis);
        const newCounter = (newMillis === this.millis) ? this.counter + 1 : 0;
        return new Hlc(newMillis, newCounter, this.nodeId);
    }

    public receive(remote: Hlc, wallTimeMillis: number): Hlc {
        const newMillis = Math.max(Math.max(this.millis, remote.millis), wallTimeMillis);
        
        let newCounter: number;
        if (newMillis === this.millis && newMillis === remote.millis) {
            newCounter = Math.max(this.counter, remote.counter) + 1;
        } else if (newMillis === this.millis) {
            newCounter = this.counter + 1;
        } else if (newMillis === remote.millis) {
            newCounter = remote.counter + 1;
        } else {
            newCounter = 0;
        }

        return new Hlc(newMillis, newCounter, this.nodeId);
    }

    public compare(other: Hlc): number {
        if (this.millis !== other.millis) {
            return this.millis - other.millis;
        }
        if (this.counter !== other.counter) {
            return this.counter - other.counter;
        }
        return this.nodeId.localeCompare(other.nodeId);
    }
}
