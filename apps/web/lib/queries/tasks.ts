import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskInput, TaskDTO } from '@atlas/shared';
import { TasksApi } from '@/lib/api';

export const taskKeys = {
  list: ['tasks'] as const,
};

export function useTasks() {
  return useQuery({ queryKey: taskKeys.list, queryFn: TasksApi.list });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateTaskInput> & { title: string }) => TasksApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.list }),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: TaskDTO) => TasksApi.complete(task.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.list }),
  });
}

export function useRemoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: TaskDTO) => TasksApi.remove(task.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.list }),
  });
}
