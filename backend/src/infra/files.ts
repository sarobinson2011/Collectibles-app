import { mkdirSync, createWriteStream, existsSync } from 'fs';
import { dirname } from 'path';

export function makeJsonl(path: string) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stream = createWriteStream(path, { flags: 'a' });
    return (obj: unknown) => stream.write(JSON.stringify(obj) + '\n');
}
