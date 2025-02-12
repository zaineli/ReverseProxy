
import { z } from 'zod';

const headersSchema = z.object({
    name: z.string(),
    value: z.string(),
});


const upstreamsSchema = z.object({
    id: z.string(),
    url: z.string().url(),
});

const rulesSchema = z.object({
    path : z.string(),
    upstream: z.array(z.string()),
})

const serverSchema = z.object({
    listen : z.number(),
    workers: z.number().optional(),
    upstreams : z.array(upstreamsSchema),
    headers: z.array(headersSchema).optional(),
    rules: z.array(rulesSchema),
});


export const rootSchema = z.object({
    server: serverSchema
});
