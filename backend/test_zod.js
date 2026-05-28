const { z } = require('zod');
const schema = z.object({ mongodbUri: z.string().min(1) });
const res = schema.safeParse({ mongodbUri: '' });
console.log(Object.keys(res.error));
console.log(res.error.issues);
