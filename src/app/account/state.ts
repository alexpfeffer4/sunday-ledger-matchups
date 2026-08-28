export type UsernameActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialUsernameActionState: UsernameActionState = {
  status: "idle",
  message: "",
};
