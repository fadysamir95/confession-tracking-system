export interface ActionState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export const INITIAL_ACTION_STATE: ActionState = {
  ok: false,
  message: "",
};
