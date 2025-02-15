
import { z } from 'zod';

const headersSchema = z.object({
    name: z.string(),
    value: z.string(),
});


const upstreamsSchema = z.object({
    id: z.string(),
    url: z.string(),
});

const rulesSchema = z.object({
    path : z.string(),
    upstream: z.array(z.string()).optional(),
    static_file: z.string().optional(),
})


const serverSchema = z.object({
    listen : z.number(),
    workers: z.number().optional(),
    upstreams : z.array(upstreamsSchema),
    headers: z.array(headersSchema).optional(),
    rules: z.array(rulesSchema),
});


export const rootConfigSchema = z.object({
    server: serverSchema
});

export type rootConfigSchema = z.infer<typeof rootConfigSchema>;
