export type RunTasksState = {
  message: string | null;
  saved: boolean;
};

export const initialRunTasksState: RunTasksState = {
  message: null,
  saved: false,
};
