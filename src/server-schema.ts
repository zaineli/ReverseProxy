import { url } from 'inspector';

import path from 'path';

import { z } from 'zod';


export const workerMessageSchema = z.object({
    requestType: z.enum(['http', 'https']),
    headers: z.any(),
    body: z.string(),
    url: z.string(),
});


export const replyMessageSchema = z.object({
    data: z.any().optional(),
    errorCode: z.number().optional(),
    errorMessage: z.string().optional(),
});

export type WorkerMessage = z.infer<typeof workerMessageSchema>;
export type ReplyMessage = z.infer<typeof replyMessageSchema>;