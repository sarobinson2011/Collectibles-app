import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
    RPC_WS_URL: z.string().url(),
    RPC_HTTP_URL: z.string().url(),
    REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    NFT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    MARKET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    CHAIN_ID: z.coerce.number().default(421614),
    CONFIRMATIONS: z.coerce.number().default(3),
    LOG_DIR: z.string().default('./data'),
    PORT: z.coerce.number().optional()
});

export const env = Env.parse(process.env);
