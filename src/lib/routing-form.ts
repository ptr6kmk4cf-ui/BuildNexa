export type RouteTasksState = {
  message: string | null;
  saved: boolean;
};

export const initialRouteTasksState: RouteTasksState = {
  message: null,
  saved: false,
};
