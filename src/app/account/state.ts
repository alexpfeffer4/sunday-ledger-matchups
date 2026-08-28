export type UsernameActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialUsernameActionState: UsernameActionState = {
  status: "idle",
  message: "",
};

export type AccountSetupState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<
    Record<"username" | "password" | "confirmPassword", string>
  >;
};

export const initialAccountSetupState: AccountSetupState = {
  status: "idle",
  message: "",
};
