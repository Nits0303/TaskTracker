import { CreateTaskSchema } from '@repo/shared';
const body = {
  title: 'Test',
  status: 'Todo',
  dueDate: new Date('2026-06-11').toISOString(),
};
const result = CreateTaskSchema.omit({ projectId: true }).safeParse(body);
console.log(JSON.stringify(result, null, 2));
